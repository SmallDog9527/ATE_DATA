from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from sqlalchemy.sql import func
from app.core.database import Base

class FtpExtractedFile(Base):
    """
    FTP decompressed/extracted file log (tracking individual extracted file status).
    All database fields, comments, and statuses must follow English requirements.
    """
    __tablename__ = "ftp_extracted_files"

    id = Column(Integer, primary_key=True, index=True)
    ftp_log_id = Column(Integer, ForeignKey("ftp_upload_logs.id", ondelete="CASCADE"), nullable=False, index=True)

    filename = Column(String, nullable=False)     # Full filename (including extension)
    status = Column(String, nullable=False)       # success / failed / del
    error_msg = Column(String, nullable=True)     # Error details or reason for deletion in English
    processed_at = Column(DateTime, server_default=func.now())
