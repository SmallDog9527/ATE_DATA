from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Boolean
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.core.database import Base

class Datasheet(Base):
    """
    Datasheet metadata for a specific product
    """
    __tablename__ = "datasheets"

    id = Column(Integer, primary_key=True, index=True)
    product_name = Column(String, index=True, nullable=False) # e.g. 'HL5083A'
    filename = Column(String, nullable=False)
    revision = Column(String, nullable=True) # e.g. '1.0'
    created_at = Column(DateTime, server_default=func.now())
    
    parameters = relationship("DatasheetParameter", back_populates="datasheet", cascade="all, delete-orphan", order_by="DatasheetParameter.id")

class DatasheetParameter(Base):
    """
    Electrical characteristics parsed from the datasheet DOCX
    """
    __tablename__ = "datasheet_parameters"

    id = Column(Integer, primary_key=True, index=True)
    datasheet_id = Column(Integer, ForeignKey("datasheets.id", ondelete="CASCADE"), nullable=False)
    symbol = Column(String, index=True, nullable=False) # e.g. 'IQ_STBY_VIN3V3'
    parameter_name = Column(String, nullable=True) # e.g. 'Quiescent Current for VIN_3V3'
    condition = Column(String, nullable=True) # Test condition text
    min_str = Column(String, nullable=True)
    typ_str = Column(String, nullable=True)
    max_str = Column(String, nullable=True)
    min_val = Column(Float, nullable=True)
    typ_val = Column(Float, nullable=True)
    max_val = Column(Float, nullable=True)
    unit = Column(String, nullable=True) # e.g. 'uA'
    remark = Column(String, nullable=True) # User comments/remarks
    created_at = Column(DateTime, server_default=func.now())

    datasheet = relationship("Datasheet", back_populates="parameters")

class ParameterMapping(Base):
    """
    Maps datasheet parameter symbols to program ATE test symbols
    """
    __tablename__ = "parameter_mappings"

    id = Column(Integer, primary_key=True, index=True)
    product_name = Column(String, index=True, nullable=False) # e.g. 'HL5083A'
    datasheet_symbol = Column(String, index=True, nullable=False) # e.g. 'IQ_STBY_VIN3V3'
    ate_symbol = Column(String, index=True, nullable=False) # e.g. 'IQ_STBY_VIN3V3_VBUS_P0'
    multiplier = Column(Float, default=1.0) # Scale factor, e.g. 1000.0 or 0.001
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
