"""
Idempotent menu seeder for production and local development.

Upserts (inserts or updates) menu items by primary key ID, ensuring
it can run safely on every container start/restart without deleting data
or failing with duplicate key errors.
"""
from core.database import SessionLocal, Base, engine
from core.models import MenuItem

# Ensure table schemas exist
Base.metadata.create_all(bind=engine)

SEED_ITEMS = [
    # ---- Indian items ----
    {
        "id": "veg_burger",
        "name": "Veg Burger",
        "name_hi": "वेज बर्गर",
        "price": 99.0,
        "category": "food",
        "available_modifiers": "extra cheese, no onion",
        "image_url": "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=600&q=80",
    },
    {
        "id": "paneer_wrap",
        "name": "Paneer Wrap",
        "name_hi": "पनीर रैप",
        "price": 129.0,
        "category": "food",
        "available_modifiers": "spicy, mild",
        "image_url": "https://images.unsplash.com/photo-1626700051175-6818013e1d4f?auto=format&fit=crop&w=600&q=80",
    },
    {
        "id": "masala_fries",
        "name": "Masala Fries",
        "name_hi": "मसाला फ्राइज़",
        "price": 79.0,
        "category": "food",
        "available_modifiers": "extra masala",
        "image_url": "https://images.unsplash.com/photo-1576107232684-1279f390859f?auto=format&fit=crop&w=600&q=80",
    },
    {
        "id": "cold_coffee",
        "name": "Cold Coffee",
        "name_hi": "कोल्ड कॉफ़ी",
        "price": 89.0,
        "category": "drinks",
        "available_modifiers": "less sugar, no sugar",
        "image_url": "https://images.unsplash.com/photo-1517701604599-bb29b565090c?auto=format&fit=crop&w=600&q=80",
    },
    {
        "id": "samosa",
        "name": "Samosa",
        "name_hi": "समोसा",
        "price": 25.0,
        "category": "food",
        "available_modifiers": "",
        "image_url": "https://images.unsplash.com/photo-1601050690597-df0568f70950?auto=format&fit=crop&w=600&q=80",
    },
    {
        "id": "masala_chai",
        "name": "Masala Chai",
        "name_hi": "मसाला चाय",
        "price": 35.0,
        "category": "drinks",
        "available_modifiers": "extra strong, less sweet",
        "image_url": "https://images.unsplash.com/photo-1576092768241-dec231879fc3?auto=format&fit=crop&w=600&q=80",
    },
    {
        "id": "veg_thali",
        "name": "Veg Thali",
        "name_hi": "वेज थाली",
        "price": 179.0,
        "category": "food",
        "available_modifiers": "extra roti",
        "image_url": "https://images.unsplash.com/photo-1546833999-b9f581a1996d?auto=format&fit=crop&w=600&q=80",
    },
    {
        "id": "gulab_jamun",
        "name": "Gulab Jamun (2 pc)",
        "name_hi": "गुलाब जामुन",
        "price": 49.0,
        "category": "dessert",
        "available_modifiers": "",
        "image_url": "https://images.unsplash.com/photo-1605197586567-7a2e0a2936fb?auto=format&fit=crop&w=600&q=80",
    },

    # ---- Western items ----
    {
        "id": "latte",
        "name": "Latte",
        "name_hi": "लट्टे",
        "price": 150.0,
        "category": "drinks",
        "available_modifiers": "oat milk, extra shot",
        "image_url": "https://images.unsplash.com/photo-1534778101976-62847782c213?auto=format&fit=crop&w=600&q=80",
    },
    {
        "id": "espresso",
        "name": "Espresso",
        "name_hi": "एस्प्रेसो",
        "price": 100.0,
        "category": "drinks",
        "available_modifiers": "double shot",
        "image_url": "https://images.unsplash.com/photo-1510591509098-f4fdc6d0ff04?auto=format&fit=crop&w=600&q=80",
    },
    {
        "id": "blueberry_muffin",
        "name": "Blueberry Muffin",
        "name_hi": "ब्लूबेरी मफ़िन",
        "price": 120.0,
        "category": "food",
        "available_modifiers": "",
        "image_url": "https://images.unsplash.com/photo-1607958996333-41aef7caefaa?auto=format&fit=crop&w=600&q=80",
    },
]

def seed_menu():
    db = SessionLocal()
    try:
        inserted_count = 0
        updated_count = 0

        for item_data in SEED_ITEMS:
            existing = db.query(MenuItem).filter(MenuItem.id == item_data["id"]).first()
            if existing:
                # Update existing row in place
                existing.name = item_data["name"]
                existing.name_hi = item_data["name_hi"]
                existing.price = item_data["price"]
                existing.category = item_data["category"]
                existing.available_modifiers = item_data["available_modifiers"]
                existing.image_url = item_data["image_url"]
                updated_count += 1
            else:
                # Insert new item
                new_item = MenuItem(**item_data)
                db.add(new_item)
                inserted_count += 1

        db.commit()
        print(f"Menu seeding complete: {inserted_count} inserted, {updated_count} updated.")
    except Exception as e:
        db.rollback()
        print(f"Menu seeding error: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    seed_menu()