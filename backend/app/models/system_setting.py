from sqlalchemy import Column, Integer, String, Boolean, DateTime
from sqlalchemy.sql import func
from app.core.database import Base


class SystemSetting(Base):
    """全局系统配置（单行，永远只有1条记录）"""
    __tablename__ = "system_settings"

    id = Column(Integer, primary_key=True, index=True)

    # SMTP 邮箱配置
    smtp_host = Column(String, nullable=True)
    smtp_port = Column(Integer, nullable=True)
    smtp_user = Column(String, nullable=True)
    smtp_pass_enc = Column(String, nullable=True)   # Fernet 加密后的密码
    smtp_from = Column(String, nullable=True)        # 发件人地址（默认=smtp_user）
    smtp_ssl = Column(Boolean, default=True)         # True=SSL(465), False=STARTTLS(587)

    updated_at = Column(DateTime, onupdate=func.now(), server_default=func.now())
