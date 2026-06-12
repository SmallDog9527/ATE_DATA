from sqlalchemy import Column, Integer, String, BigInteger, DateTime, ForeignKey
from sqlalchemy.sql import func
from app.core.database import Base


class FtpUploadLog(Base):
    """FTP 自动上传日志（用于去重判断及追踪状态）"""
    __tablename__ = "ftp_upload_logs"

    id = Column(Integer, primary_key=True, index=True)
    osat_id = Column(Integer, ForeignKey("osat_configs.id", ondelete="CASCADE"), nullable=False, index=True)

    # 去重关键字段：FTP 上的完整路径
    remote_path = Column(String, nullable=False, index=True)
    filename = Column(String, nullable=True)

    # 处理结果
    status = Column(String, nullable=False)   # success / failed / processing
    error_msg = Column(String, nullable=True)
    file_size = Column(BigInteger, nullable=True)
    lot_id_created = Column(Integer, nullable=True)   # 成功时对应的 Lot.id

    uploaded_at = Column(DateTime, server_default=func.now())
