import sqlite3
con = sqlite3.connect("kiosk.db")
tables = con.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()
print(tables)
con.close()