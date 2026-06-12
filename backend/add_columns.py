from app.core.database import engine
from sqlalchemy import text
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def add_columns():
    columns = [
        ("beginning_time", "TIMESTAMP"),
        ("ending_time", "TIMESTAMP")
    ]
    
    with engine.connect() as conn:
        for col_name, col_type in columns:
            try:
                # 检查列是否存在 (PostgreSQL 语法)
                # 兼容性处理：尝试直接添加，捕获异常
                conn.execute(text(f"ALTER TABLE lots ADD COLUMN {col_name} {col_type}"))
                conn.commit()
                logger.info(f"Successfully added column {col_name}")
            except Exception as e:
                logger.warning(f"Could not add column {col_name} (it might already exist): {e}")
                conn.rollback()

if __name__ == "__main__":
    add_columns()
