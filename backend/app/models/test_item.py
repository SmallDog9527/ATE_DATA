from sqlalchemy import Column, Integer, String, Float, ForeignKey
from app.core.database import Base

class TestItem(Base):
    __tablename__ = "test_items"

    id = Column(Integer, primary_key=True, index=True)
    lot_id = Column(Integer, ForeignKey("lots.id"), index=True)
    item_number = Column(Integer)
    site = Column(Integer, default=0)  # 0=All Sites, 1=Site1, 2=Site2...       
    item_name = Column(String, index=True)
    unit = Column(String)
    lower_limit = Column(Float)
    upper_limit = Column(Float)
    exec_qty = Column(Integer)
    fail_count = Column(Integer)
    fail_rate = Column(Float)
    yield_rate = Column(Float)
    mean = Column(Float)
    stdev = Column(Float)
    min_val = Column(Float)
    max_val = Column(Float)
    cpu = Column(Float)
    cpl = Column(Float)
    cpk = Column(Float)
