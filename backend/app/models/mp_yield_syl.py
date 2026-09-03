from sqlalchemy import Column, Integer, String, DateTime, Text, JSON
from sqlalchemy.sql import func
from app.core.database import Base


class MpYieldSylSession(Base):
    """
    One MP-Yield SYL/SBL setup session for a product (Device).
    A session is created each time a user pastes SYL/SBL text and clicks parse.

    rules stores a JSON list of rule dicts in the form:
      {label: str, bins: [int], param: str, pct: float, direction: "gte" | "lte"}
    - direction "gte" (Bin1/yield rules): row is over spec when actual < pct
    - direction "lte" (fail-bin rules):    row is over spec when actual > pct
    """
    __tablename__ = "mp_yield_syl_sessions"

    id = Column(Integer, primary_key=True, index=True)
    product_name = Column(String, nullable=False, index=True)
    setup_time = Column(DateTime, nullable=False, index=True)
    raw_text = Column(Text, nullable=True)
    rules = Column(JSON, nullable=False, default=list)
    created_by = Column(Integer, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
