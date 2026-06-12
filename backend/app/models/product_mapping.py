from sqlalchemy import Column, Integer, String, DateTime
from sqlalchemy.sql import func
from app.core.database import Base

class ProductMapping(Base):
    __tablename__ = "product_mappings"

    id = Column(Integer, primary_key=True, index=True)
    program_prefix = Column(String, unique=True, index=True)  # HL5083ACP00_204KM
    product_name = Column(String)                              # HL5083A-BD
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())