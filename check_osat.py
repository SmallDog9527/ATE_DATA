from app.core.database import SessionLocal
from app.models.osat_config import OsatConfig
from app.models.ftp_upload_log import FtpUploadLog
from sqlalchemy import func

db = SessionLocal()
osats = db.query(OsatConfig).all()
print('=== OSAT Configurations ===')
for o in osats:
    log_count = db.query(func.count(FtpUploadLog.id)).filter(FtpUploadLog.osat_id == o.id).scalar()
    print(f'ID: {o.id} | Name: {o.name} | Enabled: {o.enabled} | Logs: {log_count}')
