from sqlalchemy import Column, Integer, String, DateTime, Text
from sqlalchemy.sql import func
from app.core.database import Base


class PgsUpload(Base):
    """PGS ????????"""
    __tablename__ = "pgs_uploads"

    id = Column(Integer, primary_key=True, index=True)
    filename = Column(String, nullable=False)
    product_name = Column(String, index=True, nullable=True)
    storage_path = Column(String, nullable=True)
    upload_date = Column(DateTime, server_default=func.now())
    uploader_id = Column(Integer, nullable=True)
    # ????
    program_version = Column(String, nullable=True)   # ? 'V08'???????
    pgs_version = Column(Integer, nullable=True)       # ? 1007 / 1002
    parse_status = Column(String, default="pending")   # pending / ok / error
    parse_error = Column(Text, nullable=True)          # ??????????
    parsed_params = Column(Text, nullable=True)        # JSON: Param ???
    parsed_summary = Column(Text, nullable=True)       # JSON: Summary ???
    datasheet_filename = Column(String, nullable=True)
    datasheet_path = Column(String, nullable=True)
    sbl_input = Column(Text, nullable=True)            # ?? SBL ???????
    remark = Column(String, nullable=True)             # ??
