from sqlalchemy import Column, Integer, String, DateTime, Float
from sqlalchemy.sql import func
from app.core.database import Base


class ProgramChangeExtra(Base):
    """程序变更页面中用户手动填写的附加信息"""
    __tablename__ = "program_change_extras"

    id = Column(Integer, primary_key=True, index=True)
    lot_id = Column(Integer, nullable=False, index=True, unique=True)
    engineer = Column(String, nullable=True)
    package = Column(String, nullable=True)
    hardware_info = Column(String, nullable=True)
    data_type_override = Column(String, nullable=True)   # 'CP' | 'FT'，覆盖 lot.data_type
    ft_touch_down_s = Column(Float, nullable=True)        # FT 用户手动填写的 TouchDown 秒数
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    remark = Column(String, nullable=True)
