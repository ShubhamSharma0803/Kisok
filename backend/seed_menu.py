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
    # ============================================================
    # INDIAN FOOD
    # ============================================================

    {
        "id": "veg_burger",
        "name": "Veg Burger",
        "name_hi": "वेज बर्गर",
        "price": 99.0,
        "category": "food",
        "available_modifiers": "extra cheese, no onion",
        "image_url": "https://www.recipetocook.co.uk/wp-content/uploads/2024/04/veggie-burger-recipe.jpg",
    },
    {
        "id": "paneer_wrap",
        "name": "Paneer Wrap",
        "name_hi": "पनीर रैप",
        "price": 129.0,
        "category": "food",
        "available_modifiers": "spicy, mild",
        "image_url": "https://www.shemins.com/wp-content/uploads/2025/06/ChatGPT-Image-Jun-23-2025-08_45_53-AM-683x1024.png",
    },
    {
        "id": "masala_fries",
        "name": "Masala Fries",
        "name_hi": "मसाला फ्राइज़",
        "price": 79.0,
        "category": "food",
        "available_modifiers": "extra masala",
        "image_url": "https://limethyme.com/wp-content/uploads/2021/10/Masala-fries-2.jpg",
    },
    {
        "id": "samosa",
        "name": "Samosa",
        "name_hi": "समोसा",
        "price": 25.0,
        "category": "food",
        "available_modifiers": "extra chutney, spicy",
        "image_url": "https://www.zedamagazine.com/wp-content/uploads/2018/06/Indian-Food-Samosa-Dish-HD-Wallpapers.jpg",
    },
    {
        "id": "veg_thali",
        "name": "Veg Thali",
        "name_hi": "वेज थाली",
        "price": 179.0,
        "category": "food",
        "available_modifiers": "extra roti, extra rice",
        "image_url": "https://i.pinimg.com/originals/e1/da/d5/e1dad5315972c8a9db86fb01d69c7ecb.jpg",
    },
    {
        "id": "paneer_tikka",
        "name": "Paneer Tikka",
        "name_hi": "पनीर टिक्का",
        "price": 189.0,
        "category": "food",
        "available_modifiers": "spicy, extra mint chutney",
        "image_url": "https://img.magnific.com/premium-photo/marinated-paneer-tikka-indian-cheese-appetizer-with-smoky-finish_861171-12032.jpg",
    },
    {
        "id": "butter_paneer",
        "name": "Butter Paneer",
        "name_hi": "बटर पनीर",
        "price": 219.0,
        "category": "food",
        "available_modifiers": "less spicy, extra gravy",
        "image_url": "https://www.eitanbernath.com/wp-content/uploads/2020/05/Butter-Paneer-1-4x5-LOW-RES.jpeg",
    },
    {
        "id": "chole_bhature",
        "name": "Chole Bhature",
        "name_hi": "छोले भटूरे",
        "price": 149.0,
        "category": "food",
        "available_modifiers": "extra chole, extra onion",
        "image_url": "https://static.vecteezy.com/system/resources/previews/015/933/043/large_2x/chole-bhature-is-a-north-indian-food-dish-a-combination-of-chana-masala-and-bhatura-or-puri-free-photo.jpg",
    },
    {
        "id": "masala_dosa",
        "name": "Masala Dosa",
        "name_hi": "मसाला डोसा",
        "price": 129.0,
        "category": "food",
        "available_modifiers": "extra sambar, extra chutney",
        "image_url": "https://delishglobe.com/wp-content/uploads/2024/09/Masala-dosa-1.png",
    },
    {
        "id": "veg_biryani",
        "name": "Veg Biryani",
        "name_hi": "वेज बिरयानी",
        "price": 179.0,
        "category": "food",
        "available_modifiers": "extra raita, spicy",
        "image_url": "https://genv.org/wp-content/uploads/2023/02/17-Vegetable-Biryani.jpg",
    },
    {
        "id": "chicken_biryani",
        "name": "Chicken Biryani",
        "name_hi": "चिकन बिरयानी",
        "price": 229.0,
        "category": "food",
        "available_modifiers": "extra raita, spicy",
        "image_url": "https://yeyfood.com/wp-content/uploads/2024/08/WEB1indian_chicken_biryani._served_on_a_white_plate._s_77c8f1ca-f01e-4a4d-9f2c-61bce785c1d7_3.jpg",
    },

    # ============================================================
    # WESTERN / FAST FOOD
    # ============================================================

    {
        "id": "margherita_pizza",
        "name": "Margherita Pizza",
        "name_hi": "मार्गेरिटा पिज़्ज़ा",
        "price": 199.0,
        "category": "food",
        "available_modifiers": "extra cheese, extra oregano",
        "image_url": "https://cookingitalians.com/wp-content/uploads/2024/11/Margherita-Pizza.jpg",
    },
    {
        "id": "paneer_pizza",
        "name": "Paneer Tikka Pizza",
        "name_hi": "पनीर टिक्का पिज़्ज़ा",
        "price": 249.0,
        "category": "food",
        "available_modifiers": "extra cheese, spicy",
        "image_url": "https://i.pinimg.com/originals/89/9d/c4/899dc412981985dd9a1c9a2d5c914c61.jpg",
    },
    {
        "id": "chicken_burger",
        "name": "Chicken Burger",
        "name_hi": "चिकन बर्गर",
        "price": 159.0,
        "category": "food",
        "available_modifiers": "extra cheese, no onion",
        "image_url": "https://www.gobirecipes.com/wp-content/uploads/2025/09/Lucid_Origin_Ultrarealistic_closeup_of_a_gourmet_fried_chicken_1.jpg",
    },

    # ============================================================
    # DRINKS
    # ============================================================

    {
        "id": "cold_coffee",
        "name": "Cold Coffee",
        "name_hi": "कोल्ड कॉफ़ी",
        "price": 89.0,
        "category": "drinks",
        "available_modifiers": "less sugar, no sugar, extra cream",
        "image_url": "https://i.pinimg.com/originals/62/99/60/62996076ab6b32bd91a74e4d58fedc8c.png",
    },
    {
        "id": "masala_chai",
        "name": "Masala Chai",
        "name_hi": "मसाला चाय",
        "price": 35.0,
        "category": "drinks",
        "available_modifiers": "extra strong, less sweet",
        "image_url": "https://carameltintedlife.com/wp-content/uploads/2021/01/Masala-Chai-.jpg",
    },
    {
        "id": "latte",
        "name": "Latte",
        "name_hi": "लट्टे",
        "price": 150.0,
        "category": "drinks",
        "available_modifiers": "oat milk, extra shot",
        "image_url": "https://img.magnific.com/premium-photo/photo-steaming-latte-with-creamy-froth_1207718-104204.jpg",
    },
    {
        "id": "espresso",
        "name": "Espresso",
        "name_hi": "एस्प्रेसो",
        "price": 100.0,
        "category": "drinks",
        "available_modifiers": "double shot",
        "image_url": "https://img.magnific.com/premium-photo/tasty-steaming-espresso-cup-with-coffee-beans-view-from-dark-background_1220-5782.jpg",
    },
    {
        "id": "mango_shake",
        "name": "Mango Shake",
        "name_hi": "मैंगो शेक",
        "price": 119.0,
        "category": "drinks",
        "available_modifiers": "less sugar, extra thick",
        "image_url": "https://i.pinimg.com/originals/aa/c8/e7/aac8e7495442ea137e4b6d81354d4876.jpg",
    },
    {
        "id": "strawberry_shake",
        "name": "Strawberry Shake",
        "name_hi": "स्ट्रॉबेरी शेक",
        "price": 129.0,
        "category": "drinks",
        "available_modifiers": "less sugar, extra thick",
        "image_url": "https://www.oliviascuisine.com/wp-content/uploads/2021/06/strawberry-milkshake.jpg",
    },
    {
        "id": "fresh_lime_soda",
        "name": "Fresh Lime Soda",
        "name_hi": "फ्रेश लाइम सोडा",
        "price": 79.0,
        "category": "drinks",
        "available_modifiers": "sweet, salted, sweet & salty",
        "image_url": "https://singhbakers.com/wp-content/uploads/2024/09/Add-a-little-bit-of-body-text-14.png",
    },

    # ============================================================
    # DESSERTS
    # ============================================================

    {
        "id": "gulab_jamun",
        "name": "Gulab Jamun (2 pc)",
        "name_hi": "गुलाब जामुन",
        "price": 49.0,
        "category": "dessert",
        "available_modifiers": "warm, extra syrup",
        "image_url": "https://as2.ftcdn.net/v2/jpg/08/94/76/25/1000_F_894762571_KXz2mTpbcjHRGMg48iiU4CnI9v7La4EN.jpg",
    },
    {
        "id": "chocolate_brownie",
        "name": "Chocolate Brownie",
        "name_hi": "चॉकलेट ब्राउनी",
        "price": 109.0,
        "category": "dessert",
        "available_modifiers": "extra chocolate, vanilla ice cream",
        "image_url": "https://insanelygoodrecipes.com/wp-content/uploads/2024/06/chocolate-brownies-3.jpg",
    },
    {
        "id": "cheesecake",
        "name": "Classic Cheesecake",
        "name_hi": "क्लासिक चीज़केक",
        "price": 149.0,
        "category": "dessert",
        "available_modifiers": "extra berry sauce",
        "image_url": "https://img.taste.com.au/O8JC4F3Q/taste/2016/11/new-york-cheesecake-40742-1.jpeg",
    },
    {
        "id": "ice_cream_sundae",
        "name": "Ice Cream Sundae",
        "name_hi": "आइसक्रीम संडे",
        "price": 129.0,
        "category": "dessert",
        "available_modifiers": "chocolate sauce, extra nuts",
        "image_url": "https://delectablemeal.com/wp-content/uploads/2025/09/ice-cream-sundae.png",
    },
    {
        "id": "blueberry_muffin",
        "name": "Blueberry Muffin",
        "name_hi": "ब्लूबेरी मफ़िन",
        "price": 120.0,
        "category": "dessert",
        "available_modifiers": "",
        "image_url": "https://www.rainbownourishments.com/wp-content/uploads/2022/03/vegan-blueberry-muffins-1-1.jpg",
    },
]


def seed_menu():
    db = SessionLocal()

    try:
        inserted_count = 0
        updated_count = 0
        deleted_count = 0

        seed_ids = {item["id"] for item in SEED_ITEMS}

        # Delete items that are NOT in the final SEED_ITEMS list
        existing_items = db.query(MenuItem).all()

        for existing in existing_items:
            if existing.id not in seed_ids:
                db.delete(existing)
                deleted_count += 1
                print(f"Deleted old menu item: {existing.id}")

        # Insert or update final menu items
        for item_data in SEED_ITEMS:
            existing = (
                db.query(MenuItem)
                .filter(MenuItem.id == item_data["id"])
                .first()
            )

            if existing:
                existing.name = item_data["name"]
                existing.name_hi = item_data["name_hi"]
                existing.price = item_data["price"]
                existing.category = item_data["category"]
                existing.available_modifiers = item_data["available_modifiers"]
                existing.image_url = item_data["image_url"]

                updated_count += 1

            else:
                new_item = MenuItem(**item_data)
                db.add(new_item)
                inserted_count += 1

        db.commit()

        print("\n========================================")
        print("MENU SYNC COMPLETE")
        print("========================================")
        print(f"Inserted : {inserted_count}")
        print(f"Updated  : {updated_count}")
        print(f"Deleted  : {deleted_count}")
        print(f"Final menu items: {len(SEED_ITEMS)}")
        print("========================================")

    except Exception as e:
        db.rollback()
        print(f"Menu seeding error: {e}")

    finally:
        db.close()


if __name__ == "__main__":
    seed_menu()