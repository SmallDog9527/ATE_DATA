import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from app.core.database import engine, SessionLocal
from sqlalchemy import text
from app.models.lot import Lot

def test_db():
    results = []
    try:
        with engine.connect() as conn:
            res = conn.execute(text("SELECT column_name FROM information_schema.columns WHERE table_name = 'lots'"))
            columns = [r[0] for r in res]
            results.append(f"Columns: {columns}")
            
        db = SessionLocal()
        count = db.query(Lot).count()
        results.append(f"Lot count: {count}")
        db.close()
    except Exception as e:
        results.append(f"Error: {e}")
        
    with open("db_test_result.txt", "w") as f:
        f.write("\n".join(results))

if __name__ == "__main__":
    test_db()
