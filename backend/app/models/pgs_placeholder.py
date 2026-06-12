from sqlalchemy import Column, Integer, String, DateTime
from sqlalchemy.sql import func
from app.core.database import Base


class PgsPlaceholder(Base):
    """用户手动新增的产品名占位记录（程序变更页 "新增产品名" 功能）"""
    __tablename__ = "pgs_placeholders"

    id = Column(Integer, primary_key=True, index=True)
    product_name = Column(String, unique=True, nullable=False, index=True)
    created_at = Column(DateTime, server_default=func.now())
