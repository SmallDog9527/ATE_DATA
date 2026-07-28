# -*- coding: utf-8 -*-
import os
import sys
import time

sys.path.insert(0, '/app')

from app.core.database import SessionLocal
from app.models.osat_config import OsatConfig
from app.models.ftp_upload_log import FtpUploadLog
from app.services.ftp_service import _should_ignore_ftp_file, run_osat_fetch

def main():
    db = SessionLocal()

    print("[reparse] === Step 1: Updating ignored files in FtpUploadLog ===")
    failed_logs = db.query(FtpUploadLog).filter(FtpUploadLog.status == 'failed').all()
    ignored_count = 0
    for log in failed_logs:
        path = log.remote_path or log.filename or ""
        if _should_ignore_ftp_file(path):
            log.status = 'ignored'
            log.error_msg = 'Ignored by scan rule (log archive / FAILSUMMARY.csv)'
            ignored_count += 1

    db.commit()
    print("[reparse] Step 1 completed: %d logs updated to 'ignored'" % ignored_count)

    print("[reparse] === Step 2: Marking duplicate failed logs (already succeeded) as deleted ===")
    success_paths = set(
        r[0] for r in db.query(FtpUploadLog.remote_path).filter(FtpUploadLog.status == 'success').all()
    )
    remaining_failed = db.query(FtpUploadLog).filter(FtpUploadLog.status == 'failed').all()
    superceded_count = 0
    for log in remaining_failed:
        if log.remote_path in success_paths:
            log.status = 'deleted'
            log.error_msg = 'Superceded by existing success log'
            superceded_count += 1

    db.commit()
    print("[reparse] Step 2 completed: %d logs marked as superceded/deleted" % superceded_count)

    print("[reparse] === Step 3: Resetting remaining failed logs to 'pending' ===")
    to_reset = db.query(FtpUploadLog).filter(FtpUploadLog.status == 'failed').all()
    reset_count = len(to_reset)
    for log in to_reset:
        log.status = 'scanned'
        log.error_msg = None

    db.commit()
    print("[reparse] Step 3 completed: %d logs reset to 'pending'" % reset_count)

    osats = db.query(OsatConfig).filter(OsatConfig.enabled == True).all()
    db.close()

    print("[reparse] === Step 4: Starting batch re-parsing for enabled OSATs ===")
    for osat in osats:
        osat_id = osat.id
        osat_name = osat.name
        batch_num = 0
        
        while True:
            db_check = SessionLocal()
            pending_remaining = db_check.query(FtpUploadLog).filter(
                FtpUploadLog.osat_id == osat_id,
                FtpUploadLog.status.in_(['pending', 'scanned'])
            ).count()
            db_check.close()

            if pending_remaining == 0:
                print("[reparse] All pending files completed for OSAT %s (id=%d)!" % (osat_name, osat_id))
                break

            batch_num += 1
            print("[reparse] OSAT %s (id=%d) Batch %d: %d pending files remaining..." % (osat_name, osat_id, batch_num, pending_remaining))
            
            run_osat_fetch(osat_id, save_snapshot=False)
            time.sleep(0.5)

    print("[reparse] === All re-parsing tasks completed successfully ===")

if __name__ == '__main__':
    main()
