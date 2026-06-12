import sqlalchemy
from sqlalchemy import create_url, create_engine, text

def fix():
    # Constructing URL manually from .env
    url = "postgresql://admin:3344520Qq@localhost:5433/chip_data"
    engine = create_engine(url)
    
    columns = [
        ("beginning_time", "TIMESTAMP"),
        ("ending_time", "TIMESTAMP")
    ]
    
    with engine.connect() as conn:
        for col, col_type in columns:
            try:
                conn.execute(text(f"ALTER TABLE lots ADD COLUMN {col} {col_type}"))
                conn.commit()
                print(f"Added {col}")
            except Exception as e:
                print(f"Error adding {col}: {e}")
                conn.rollback()

if __name__ == "__main__":
    fix()
