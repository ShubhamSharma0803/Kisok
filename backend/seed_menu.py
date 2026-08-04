from core.database import SessionLocal
from core.models import MenuItem

db = SessionLocal()
db.add_all([
    MenuItem(name="Latte", price=4.50, category="drinks"),
    MenuItem(name="Espresso", price=3.00, category="drinks"),
    MenuItem(name="Blueberry Muffin", price=3.50, category="food"),
])
db.commit()
db.close()
print("Seeded menu.")