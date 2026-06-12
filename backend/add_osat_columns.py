import os
import sys
import logging

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.core.database import engine, Base
from sqlalchemy import text
import app.models  # 确保所有 model 注册

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def update_db_schema():
    logger.info("Initializing/creating missing tables (system_settings, osat_configs, ftp_upload_logs)...")
    # Base.metadata.create_all will automatically create tables that don't exist
    Base.metadata.create_all(bind=engine)
    logger.info("Tables created or checked.")

    # Check and add osat_name column to lots table
    logger.info("Checking for osat_name column on lots table...")
    with engine.connect() as conn:
        try:
            # PostgreSQL syntax to check if column exists, or try-catch
            conn.execute(text("ALTER TABLE lots ADD COLUMN osat_name VARCHAR(255)"))
            conn.commit()
            logger.info("Successfully added osat_name column to lots table.")
        except Exception as e:
            conn.rollback()
            # If the column already exists, this is fine
            if "already exists" in str(e).lower() or "duplicate column" in str(e).lower():
                logger.info("osat_name column already exists in lots table.")
            else:
                logger.error(f"Error adding osat_name column to lots table: {e}")

if __name__ == "__main__":
    update_db_schema()
