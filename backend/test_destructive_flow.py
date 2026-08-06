"""
Integration test for destructive-action confirmation flow.

Requires backend running at http://localhost:8000 with a valid GROQ_API_KEY.
Tests the in-memory pending_actions store + live order DB state.
"""

import json
import sys
import urllib.error
import urllib.request

from voice.llm import parse_order_intent
from voice.router import MENU
from voice import pending_actions

BASE = "http://localhost:8000"


def req(url, method="GET", body=None):
    data = json.dumps(body).encode() if body else None
    request = urllib.request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json"} if data else {},
        method=method,
    )
    try:
        res = urllib.request.urlopen(request)
        return res.status, json.loads(res.read().decode())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode())


def main():
    print("=== DESTRUCTIVE ACTION CONFIRMATION FLOW TEST ===\n")

    # Health check
    try:
        status, _ = req(f"{BASE}/health")
        if status != 200:
            print(f"FAIL: Backend health check returned {status}")
            sys.exit(1)
        print("Backend health: OK\n")
    except Exception as e:
        print(f"FAIL: Backend not reachable at {BASE} — start it first.\n  Error: {e}")
        sys.exit(1)

    pending_actions.clear_pending("__test__")

    # 1. Create session & add burger
    s, session = req(f"{BASE}/sessions", "POST")
    sid = session["id"]
    print(f"1. Created session: {sid}")

    item_data = {"menu_item_id": "burger_classic", "quantity": 1, "modifiers": []}
    s, order_state = req(f"{BASE}/sessions/{sid}/orders/items", "POST", item_data)
    print(f"2. Added Classic Burger. Cart count: {len(order_state['items'])}")

    cart_before = [{"id": "burger_classic", "quantity": 1, "modifiers": []}]

    # ---- TURN 1: remove the burger (should ask, NOT delete) ----
    print("\n--- TURN 1: User says 'remove the burger' ---")
    res1 = parse_order_intent("remove the burger", MENU, cart_before)
    print(f"Parsed intent: {json.dumps(res1, indent=2)}")

    needs_clarification1 = res1.get("needs_clarification")
    question1 = res1.get("clarification_question", "")
    action1 = res1.get("action")

    print(f" -> needs_clarification: {needs_clarification1}")
    print(f" -> action: {action1}")
    print(f" -> question: '{question1}'")

    assert needs_clarification1 is True, "FAIL: Turn 1 should set needs_clarification=True"
    assert action1 == "remove_item", f"FAIL: Turn 1 action should be remove_item, got {action1}"

    # Mirror what voice/router.py does on turn 1
    pending_actions.set_pending(sid, action1, res1.get("items", []), question1)

    s, current_order = req(f"{BASE}/sessions/{sid}/orders")
    print(f" -> DB cart count after Turn 1 (before confirm): {len(current_order['items'])}")
    assert len(current_order["items"]) == 1, "FAIL: DB item removed prematurely on Turn 1!"

    # ---- TURN 2: user says 'no' ----
    print("\n--- TURN 2: User says 'no' ---")
    pending = pending_actions.get_pending(sid)
    assert pending is not None, "FAIL: Pending action should exist before Turn 2"

    classification = pending_actions.classify_confirmation_response("no")
    print(f" -> classification of 'no': {classification}")
    assert classification == "negative", f"FAIL: 'no' should classify as negative, got {classification}"

    pending_actions.clear_pending(sid)
    print(" -> Pending cleared (simulating router negative branch)")

    s, final_order = req(f"{BASE}/sessions/{sid}/orders")
    print(f" -> DB cart count after 'no': {len(final_order['items'])}")
    assert len(final_order["items"]) == 1, "FAIL: Item deleted despite user saying 'no'!"
    assert pending_actions.get_pending(sid) is None, "FAIL: Pending should be cleared after 'no'"

    # ---- TURN 3: re-arm pending, user says 'yes' (should delete) ----
    print("\n--- TURN 3: Re-request remove, then user says 'yes' ---")
    pending_actions.set_pending(
        sid,
        "remove_item",
        [{"id": "burger_classic", "quantity": 1, "modifiers": []}],
        "Just to confirm, remove the Classic Burger?",
    )

    classification_yes = pending_actions.classify_confirmation_response("yes")
    print(f" -> classification of 'yes': {classification_yes}")
    assert classification_yes == "affirmative", f"FAIL: 'yes' should be affirmative, got {classification_yes}"

    pending = pending_actions.get_pending(sid)
    remove_ids = {i["id"] for i in pending.get("items", [])}
    # Execute removal via REST (mirrors _apply_intent remove_item)
    s, order_before_yes = req(f"{BASE}/sessions/{sid}/orders")
    for item in order_before_yes["items"]:
        if item["menu_item_id"] in remove_ids:
            req(f"{BASE}/sessions/{sid}/orders/items/{item['id']}", "DELETE")
    pending_actions.clear_pending(sid)

    s, order_after_yes = req(f"{BASE}/sessions/{sid}/orders")
    print(f" -> DB cart count after 'yes': {len(order_after_yes['items'])}")
    assert len(order_after_yes["items"]) == 0, "FAIL: Item should be removed after 'yes'!"

    print("\nSUCCESS: All destructive confirmation checks passed!")
    print("  - Turn 1: asks confirmation, cart unchanged")
    print("  - Turn 2 ('no'): pending cleared, cart unchanged")
    print("  - Turn 3 ('yes'): item removed from DB")


if __name__ == "__main__":
    main()
