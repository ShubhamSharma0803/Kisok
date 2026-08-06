"""
Seed the menu_items table with the merged menu (Indian + Western items) and real Unsplash food images.

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
    # ---- Indian items ----
    MenuItem(
        id="veg_burger",
        name="Veg Burger",
        name_hi="वेज बर्गर",
        price=99,
        category="food",
        available_modifiers="extra cheese, no onion",
        image_url="https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=600&q=80"
    ),
    MenuItem(
        id="paneer_wrap",
        name="Paneer Wrap",
        name_hi="पनीर रैप",
        price=129,
        category="food",
        available_modifiers="spicy, mild",
        image_url="https://images.unsplash.com/photo-1626700051175-6818013e1d4f?auto=format&fit=crop&w=600&q=80"
    ),
    MenuItem(
        id="masala_fries",
        name="Masala Fries",
        name_hi="मसाला फ्राइज़",
        price=79,
        category="food",
        available_modifiers="extra masala",
        image_url="https://images.unsplash.com/photo-1576107232684-1279f390859f?auto=format&fit=crop&w=600&q=80"
    ),
    MenuItem(
        id="cold_coffee",
        name="Cold Coffee",
        name_hi="कोल्ड कॉफ़ी",
        price=89,
        category="drinks",
        available_modifiers="less sugar, no sugar",
        image_url="https://images.unsplash.com/photo-1517701604599-bb29b565090c?auto=format&fit=crop&w=600&q=80"
    ),
    MenuItem(
        id="samosa",
        name="Samosa",
        name_hi="समोसा",
        price=25,
        category="food",
        available_modifiers="",
        image_url="https://images.unsplash.com/photo-1601050690597-df0568f70950?auto=format&fit=crop&w=600&q=80"
    ),
    MenuItem(
        id="masala_chai",
        name="Masala Chai",
        name_hi="मसाला चाय",
        price=35,
        category="drinks",
        available_modifiers="extra strong, less sweet",
        image_url="https://images.unsplash.com/photo-1576092768241-dec231879fc3?auto=format&fit=crop&w=600&q=80"
    ),
    MenuItem(
        id="veg_thali",
        name="Veg Thali",
        name_hi="वेज थाली",
        price=179,
        category="food",
        available_modifiers="extra roti",
        image_url="https://images.unsplash.com/photo-1546833999-b9f581a1996d?auto=format&fit=crop&w=600&q=80"
    ),
    MenuItem(
        id="gulab_jamun",
        name="Gulab Jamun (2 pc)",
        name_hi="गुलाब जामुन",
        price=49,
        category="dessert",
        available_modifiers="",
        image_url="https://images.unsplash.com/photo-1605197586567-7a2e0a2936fb?auto=format&fit=crop&w=600&q=80"
    ),

    # ---- Western items ----
    MenuItem(
        id="latte",
        name="Latte",
        name_hi="लट्टे",
        price=150,
        category="drinks",
        available_modifiers="oat milk, extra shot",
        image_url="https://images.unsplash.com/photo-1534778101976-62847782c213?auto=format&fit=crop&w=600&q=80"
    ),
    MenuItem(
        id="espresso",
        name="Espresso",
        name_hi="एस्प्रेसो",
        price=100,
        category="drinks",
        available_modifiers="double shot",
        image_url="https://images.unsplash.com/photo-1510591509098-f4fdc6d0ff04?auto=format&fit=crop&w=600&q=80"
    ),
    MenuItem(
        id="blueberry_muffin",
        name="Blueberry Muffin",
        name_hi="ब्लूबेरी मफ़िन",
        price=120,
        category="food",
        available_modifiers="",
        image_url="https://images.unsplash.com/photo-1607958996333-41aef7caefaa?auto=format&fit=crop&w=600&q=80"
    ),
])
db.commit()
db.close()
print("Seeded 11 menu items with Unsplash image URLs.")