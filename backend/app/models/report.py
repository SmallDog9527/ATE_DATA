from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, JSON
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base

class Report(Base):
    __tablename__ = "reports"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    product_name = Column(String, nullable=True)
    url = Column(String, nullable=False)
    type = Column(String, default="Multi-Bin Analysis")
    source = Column(String, default="eng", nullable=False, index=True)
    comment = Column(String, nullable=True)
    
    # config_data: 存储备注、布局、Lot顺序、Lot列宽等前端所需的详细配置数据
    config_data = Column(JSON, nullable=True)
    
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    user = relationship("User", backref="reports")

    @property
    def username(self) -> str:
        return self.user.username if self.user else "unknown"
