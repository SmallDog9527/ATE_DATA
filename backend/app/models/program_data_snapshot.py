from sqlalchemy import Column, DateTime, Integer, String, Text
from sqlalchemy.sql import func

from app.core.database import Base


class ProgramDataSnapshot(Base):
    __tablename__ = "program_data_snapshots"

    id = Column(Integer, primary_key=True, index=True)
    product_name = Column(String, unique=True, nullable=False, index=True)
    days = Column(Integer, nullable=True)
    months = Column(String, nullable=True)
    row_count = Column(Integer, nullable=False, default=0)
    rows_json = Column(Text, nullable=False)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
