"""
Batch process all pending and scanned FTP upload logs for all OSATs.
"""
import time
from app.core.database import SessionLocal
from app.models.osat_config import OsatConfig
from app.models.ftp_upload_log import FtpUploadLog
from app.services.ftp_service import run_osat_fetch

print("[batch_process] Starting full batch processing for all OSATs...")

db = SessionLocal()
try:
    osats = db.query(OsatConfig).all()
    osat_ids = [o.id for o in osats]
finally:
    db.close()

loop_count = 0
max_loops = 500  # Safety limit for maximum iterations

while loop_count < max_loops:
    loop_count += 1
    db = SessionLocal()
    unprocessed = db.query(FtpUploadLog).filter(
        FtpUploadLog.status.in_(["scanned", "pending", "downing"])
    ).count()
    db.close()

    print(f"[batch_process] Loop {loop_count}: remaining unprocessed files = {unprocessed}")
    if unprocessed == 0:
        print("[batch_process] All files processed successfully!")
        break

    for osat_id in osat_ids:
        try:
            run_osat_fetch(osat_id, save_snapshot=False)
        except Exception as e:
            print(f"[batch_process] Exception during fetch for OSAT id={osat_id}: {e}")

    time.sleep(2)

