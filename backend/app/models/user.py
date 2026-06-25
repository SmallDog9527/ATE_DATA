from sqlalchemy import Column, Integer, String, Boolean, DateTime, BigInteger
from sqlalchemy.sql import func
from app.core.database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    is_active = Column(Boolean, default=True)
    role = Column(String, default="user")             # admin, eng, user
    email_verified = Column(Boolean, default=False)   # 邮箱已验证
    created_at = Column(DateTime, server_default=func.now())
    last_login_at = Column(DateTime)                  # 最后登录时间

    # 存储配置
    storage_type = Column(String, default="local")
    storage_config = Column(String)       # JSON字符串存FTP/S3配置
    storage_used_bytes = Column(BigInteger, default=0)

    # 报表设置
    report_email = Column(String)
    weekly_report = Column(Boolean, default=False)
    monthly_report = Column(Boolean, default=False)
    receive_alerts = Column(Boolean, default=False)