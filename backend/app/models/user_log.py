"""
User action log model for tracking manual uploads, downloads, and deletions.
"""
from sqlalchemy import Column, Integer, String, Text, DateTime
from sqlalchemy.sql import func
from app.core.database import Base


class UserLog(Base):
    """
    Audit log table for recording manual user actions.
    Excludes automatic FTP scanner operations.
    """
    __tablename__ = "user_logs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, nullable=True, index=True)
    username = Column(String, nullable=True, index=True)
    action = Column(String, nullable=False, index=True)          # UPLOAD, DOWNLOAD, DELETE
    target_type = Column(String, nullable=False, index=True)     # LOT_DATA, PROGRAM_DATA, REPORT, DATASHEET, USER
    target_name = Column(String, nullable=True)                  # File name, lot name, report name, etc.
    detail = Column(Text, nullable=True)                         # Detailed description in English
    ip_address = Column(String, nullable=True)                   # Client IP address
    created_at = Column(DateTime, server_default=func.now(), index=True)
