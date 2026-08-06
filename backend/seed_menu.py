"""
Seed the menu_items table with the merged menu (Indian + Western items).

This is a stub menu for development — the full menu will be managed
via the frontend later.

Run:  python seed_menu.py
"""
from core.database import SessionLocal, Base, engine
from core.models import MenuItem

# Create tables if they don't exist yet
Base.metadata.create_all(bind=engine)

db = SessionLocal()

# Clear existing menu items to avoid duplicates on re-run
db.query(MenuItem).delete()
db.commit()

db.add_all([
    # ---- Indian items (from voice-ai) ----
    MenuItem(id="veg_burger", name="Veg Burger", name_hi="वेज बर्गर", price=99, category="food", available_modifiers="extra cheese, no onion"),
    MenuItem(id="paneer_wrap", name="Paneer Wrap", name_hi="पनीर रैप", price=129, category="food", available_modifiers="spicy, mild"),
    MenuItem(id="masala_fries", name="Masala Fries", name_hi="मसाला फ्राइज़", price=79, category="food", available_modifiers="extra masala"),
    MenuItem(id="cold_coffee", name="Cold Coffee", name_hi="कोल्ड कॉफ़ी", price=89, category="drinks", available_modifiers="less sugar, no sugar"),
    MenuItem(id="samosa", name="Samosa", name_hi="समोसा", price=25, category="food", available_modifiers=""),
    MenuItem(id="masala_chai", name="Masala Chai", name_hi="मसाला चाय", price=35, category="drinks", available_modifiers="extra strong, less sweet"),
    MenuItem(id="veg_thali", name="Veg Thali", name_hi="वेज थाली", price=179, category="food", available_modifiers="extra roti"),
    MenuItem(id="gulab_jamun", name="Gulab Jamun (2 pc)", name_hi="गुलाब जामुन", price=49, category="dessert", available_modifiers=""),

    # ---- Western items (from dev) ----
    MenuItem(id="latte", name="Latte", name_hi="लट्टे", price=150, category="drinks", available_modifiers="oat milk, extra shot"),
    MenuItem(id="espresso", name="Espresso", name_hi="एस्प्रेसो", price=100, category="drinks", available_modifiers="double shot"),
    MenuItem(id="blueberry_muffin", name="Blueberry Muffin", name_hi="ब्लूबेरी मफ़िन", price=120, category="food", available_modifiers=""),
])
db.commit()
db.close()
print("Seeded 11 menu items (8 Indian + 3 Western).")