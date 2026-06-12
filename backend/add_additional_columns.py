import os
import sys
import logging

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.core.database import engine
from sqlalchemy import text

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def update_db_schema():
    logger.info("Checking and adding additional columns to lots and osat_configs tables...")
    with engine.connect() as conn:
        # 1. Add ftp_path column to lots
        try:
            conn.execute(text("ALTER TABLE lots ADD COLUMN ftp_path VARCHAR(1000)"))
            conn.commit()
            logger.info("Successfully added ftp_path column to lots table.")
        except Exception as e:
            conn.rollback()
            if "already exists" in str(e).lower() or "duplicate column" in str(e).lower():
                logger.info("ftp_path column already exists in lots table.")
            else:
                logger.error(f"Error adding ftp_path: {e}")

        # 2. Add check_status column to lots
        try:
            conn.execute(text("ALTER TABLE lots ADD COLUMN check_status VARCHAR(20)"))
            conn.commit()
            logger.info("Successfully added check_status column to lots table.")
        except Exception as e:
            conn.rollback()
            if "already exists" in str(e).lower() or "duplicate column" in str(e).lower():
                logger.info("check_status column already exists in lots table.")
            else:
                logger.error(f"Error adding check_status: {e}")

        # 3. Add data_type column to osat_configs
        try:
            conn.execute(text("ALTER TABLE osat_configs ADD COLUMN data_type VARCHAR(10) DEFAULT 'CP'"))
            conn.commit()
            logger.info("Successfully added data_type column to osat_configs table.")
        except Exception as e:
            conn.rollback()
            if "already exists" in str(e).lower() or "duplicate column" in str(e).lower():
                logger.info("data_type column already exists in osat_configs table.")
            else:
                logger.error(f"Error adding data_type: {e}")

if __name__ == "__main__":
    update_db_schema()
