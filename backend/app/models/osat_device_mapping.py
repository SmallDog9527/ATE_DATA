from sqlalchemy import Column, Integer, String, DateTime
from sqlalchemy.sql import func
from app.core.database import Base

class OsatDeviceMapping(Base):
    __tablename__ = "osat_device_mappings"

    id = Column(Integer, primary_key=True, index=True)
    osat_product_name = Column(String, unique=True, index=True, nullable=False) # The dummy name used by OSAT
    internal_product_name = Column(String, nullable=False)                     # Our real device name
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
