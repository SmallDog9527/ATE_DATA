from pydantic import BaseModel, field_validator
from typing import Optional
from datetime import datetime


# ──────────────────────────────────────────────
# SMTP 邮箱配置
# ──────────────────────────────────────────────

class SmtpConfigIn(BaseModel):
    smtp_host: str
    smtp_port: int
    smtp_user: str
    smtp_password: str        # 明文密码，后端加密存储
    smtp_from: Optional[str] = None   # 留空则使用 smtp_user
    smtp_ssl: bool = True

    @field_validator('smtp_port')
    @classmethod
    def valid_port(cls, v):
        if not (1 <= v <= 65535):
            raise ValueError('端口号无效')
        return v


class SmtpConfigOut(BaseModel):
    smtp_host: Optional[str] = None
    smtp_port: Optional[int] = None
    smtp_user: Optional[str] = None
    smtp_from: Optional[str] = None
    smtp_ssl: bool = True
    is_configured: bool = False   # 是否已绑定邮箱


class SmtpTestRequest(BaseModel):
    to_email: str


# ──────────────────────────────────────────────
# OSAT / FTP 配置
# ──────────────────────────────────────────────

class OsatConfigIn(BaseModel):
    name: str
    ftp_host: str
    ftp_port: int = 21
    ftp_user: str
    ftp_password: str          # 明文密码，后端加密存储
    ftp_encryption: str = "plain"
    ftp_remote_dir: str = "/"
    ftp_summary_dir: str = "/"
    schedule_start: str = "22:00"
    schedule_end: str = "08:00"
    enabled: bool = False
    data_type: str = "CP"      # 数据类型 CP / FT

    @field_validator('ftp_port')
    @classmethod
    def valid_port(cls, v):
        if not (1 <= v <= 65535):
            raise ValueError('FTP端口号无效')
        return v

    @field_validator('ftp_encryption')
    @classmethod
    def valid_encryption(cls, v):
        allowed = {"plain", "explicit_tls_optional", "explicit_tls_required", "implicit_tls_required"}
        if v not in allowed:
            raise ValueError('FTP加密方式无效')
        return v

    @field_validator('schedule_start', 'schedule_end')
    @classmethod
    def valid_time_fmt(cls, v):
        import re
        if not re.match(r'^\d{2}:\d{2}$', v):
            raise ValueError('时间格式应为 HH:MM')
        h, m = int(v[:2]), int(v[3:])
        if not (0 <= h <= 23 and 0 <= m <= 59):
            raise ValueError('时间范围无效')
        return v


class OsatConfigOut(BaseModel):
    id: int
    name: str
    ftp_host: str
    ftp_port: int
    ftp_user: str
    ftp_encryption: str = "plain"
    ftp_remote_dir: str
    ftp_summary_dir: str = "/"
    schedule_start: str
    schedule_end: str
    enabled: bool
    data_type: str
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ──────────────────────────────────────────────
# FTP 上传日志
# ──────────────────────────────────────────────

class FtpLogItem(BaseModel):
    id: int
    osat_id: int
    osat_name: Optional[str] = None    # join 后填入
    remote_path: str
    filename: Optional[str] = None
    status: str
    error_msg: Optional[str] = None
    file_size: Optional[int] = None
    lot_id_created: Optional[int] = None
    uploaded_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class FtpLogPage(BaseModel):
    total: int
    page: int
    page_size: int
    items: list[FtpLogItem]
