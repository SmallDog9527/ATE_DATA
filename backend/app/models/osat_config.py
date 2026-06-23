from sqlalchemy import Column, Integer, String, Boolean, DateTime
from sqlalchemy.sql import func
from app.core.database import Base


class OsatConfig(Base):
    """OSAT FTP 配置（每个 OSAT 一行，支持多个）"""
    __tablename__ = "osat_configs"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, nullable=False, index=True)   # OSAT 名称，如 CMC

    # FTP 连接信息
    protocol = Column(String, default="ftp", nullable=False)        # ftp / sftp
    ftp_host = Column(String, nullable=False)

    ftp_port = Column(Integer, default=21)
    ftp_user = Column(String, nullable=False)
    ftp_pass_enc = Column(String, nullable=False)   # Fernet 加密后的密码
    ftp_encryption = Column(String, default="plain") # plain / explicit_tls_optional / explicit_tls_required / implicit_tls_required
    ftp_remote_dir = Column(String, default="/")    # 抓取根目录
    ftp_summary_dir = Column(String, default="/")   # Summary 目录

    # 定时抓取设置
    schedule_start = Column(String, default="22:00")   # 开始时间 HH:MM
    schedule_end = Column(String, default="08:00")     # 结束时间 HH:MM
    enabled = Column(Boolean, default=False)            # 是否启用定时抓取
    data_type = Column(String, default="CP")            # 数据类型 CP / FT

    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, onupdate=func.now(), server_default=func.now())
