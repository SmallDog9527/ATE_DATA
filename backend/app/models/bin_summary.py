
from sqlalchemy import Column, Integer, String, Float, ForeignKey
from app.core.database import Base

class BinSummary(Base):
    __tablename__ = "bin_summary"

    id = Column(Integer, primary_key=True, index=True)
    lot_id = Column(Integer, ForeignKey("lots.id"), index=True)
    bin_number = Column(Integer)
    bin_name = Column(String)
    site = Column(Integer)            # 0=All, 1=Site1, 2=Site2...
    count = Column(Integer)
    percentage = Column(Float)
    data_range = Column(String, default="final")  # 新增
    comment = Column(String, default="")          # 记录失效原因