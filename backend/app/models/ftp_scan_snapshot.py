from sqlalchemy import Column, Integer, Date, DateTime, ForeignKey
from sqlalchemy.sql import func
from app.core.database import Base


class FtpScanSnapshot(Base):
    """FTP daily scan snapshot for counting files status on FTP"""
    __tablename__ = "ftp_scan_snapshots"

    id = Column(Integer, primary_key=True, index=True)
    scan_date = Column(Date, nullable=False, index=True)
    osat_id = Column(Integer, ForeignKey("osat_configs.id", ondelete="CASCADE"), nullable=False, index=True)

    success_count = Column(Integer, default=0, nullable=False)
    failed_count = Column(Integer, default=0, nullable=False)
    scanned_count = Column(Integer, default=0, nullable=False)

    last_scan_time = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
