from sqlalchemy import Column, Integer, String, DateTime, JSON
from sqlalchemy.sql import func
from app.core.database import Base

class IdleCheckConfig(Base):
    __tablename__ = "idle_check_configs"

    id = Column(Integer, primary_key=True, index=True)
    program_name = Column(String, unique=True, index=True)
    params = Column(JSON)  # List of parameter names
    threshold = Column(Integer, default=2) # Consecutive duplicate count threshold
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
