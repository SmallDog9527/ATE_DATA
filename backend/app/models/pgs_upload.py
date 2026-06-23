from sqlalchemy import Column, Integer, String, DateTime, Text
from sqlalchemy.sql import func
from app.core.database import Base


class PgsUpload(Base):
    """PGS 程序文件上传记录"""
    __tablename__ = "pgs_uploads"

    id = Column(Integer, primary_key=True, index=True)
    filename = Column(String, nullable=False)
    product_name = Column(String, index=True, nullable=True)
    storage_path = Column(String, nullable=True)
    upload_date = Column(DateTime, server_default=func.now())
    uploader_id = Column(Integer, nullable=True)
    # 解析结果
    program_version = Column(String, nullable=True)   # 如 'V08'，从文件名提取
    pgs_version = Column(Integer, nullable=True)       # 如 1007 / 1002
    parse_status = Column(String, default="pending")   # pending / ok / error
    parse_error = Column(Text, nullable=True)          # 解析失败时的错误信息
    parsed_params = Column(Text, nullable=True)        # JSON: Param 表数据
    parsed_summary = Column(Text, nullable=True)       # JSON: Summary 表数据
    datasheet_filename = Column(String, nullable=True)
    datasheet_path = Column(String, nullable=True)
    sbl_input = Column(Text, nullable=True)            # 原始 SBL 解析输入框文本


