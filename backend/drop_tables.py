from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.core.config import settings
from app.core.database import Base

def drop_all_tables():
    engine = create_engine(settings.DATABASE_URL)
    Base.metadata.drop_all(engine)
    print("All tables dropped successfully!")

if __name__ == "__main__":
    drop_all_tables()