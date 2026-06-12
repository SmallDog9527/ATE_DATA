from sqlalchemy import Column, Integer, String, DateTime
from sqlalchemy.sql import func
from app.core.database import Base

class ProgramBinName(Base):
    __tablename__ = "program_bin_names"

    id = Column(Integer, primary_key=True, index=True)
    program = Column(String, index=True)
    bin_number = Column(Integer)
    bin_name = Column(String)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
