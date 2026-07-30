"""
Continuous pipeline worker that maintains exactly 12 parallel processing threads.
Refills workers immediately whenever active in-flight count drops below capacity.
"""
import time
import os
from concurrent.futures import ThreadPoolExecutor
from app.core.database import SessionLocal
from app.models.user import User
from app.models.ftp_upload_log import FtpUploadLog
from app.services.ftp_service import _do_download, _do_parse

MAX_PARALLEL_WORKERS = 12

def process_single_log(log_id: int):
    """
    Process a single FtpUploadLog item through download and parsing pipeline.
    """
    db = SessionLocal()
    try:
        log = db.query(FtpUploadLog).filter(FtpUploadLog.id == log_id).first()
        if not log or log.status in ('success', 'failed', 'ignored'):
            return
            
        osat_id = log.osat_id
        remote_path = log.remote_path
        
        # Get uploader user ID
        admin = db.query(User).filter(User.role == 'admin').first()
        admin_user_id = admin.id if admin else 1
        db.close()
        
        # Execute download step
        res = _do_download(log_id, osat_id, remote_path, admin_user_id)
        if res is None:
            return
            
        log_id, tmp_dir, csv_files = res
        
        # Execute parse step
        _do_parse(log_id, osat_id, remote_path, tmp_dir, csv_files, admin_user_id)
    except Exception as e:
        print(f"[continuous_pipeline] Error processing log_id={log_id}: {e}")
        try:
            db_err = SessionLocal()
            log_rec = db_err.query(FtpUploadLog).filter(FtpUploadLog.id == log_id).first()
            if log_rec and log_rec.status not in ('success', 'failed'):
                log_rec.status = 'failed'
                log_rec.error_msg = f"[Pipeline Error] {str(e)[:250]}"
                db_err.commit()
            db_err.close()
        except Exception:
            pass


def main():
    print(f"[continuous_pipeline] Starting continuous pipeline worker pool (capacity={MAX_PARALLEL_WORKERS})...")
    executor = ThreadPoolExecutor(max_workers=MAX_PARALLEL_WORKERS, thread_name_prefix="cont_pipe")
    active_futures = set()
    
    loop_count = 0
    while True:
        loop_count += 1
        
        # Remove finished futures
        done_futures = {f for f in active_futures if f.done()}
        active_futures -= done_futures
        
        # Calculate how many new items are needed to fill up to MAX_PARALLEL_WORKERS
        in_flight = len(active_futures)
        slots_needed = MAX_PARALLEL_WORKERS - in_flight
        
        if slots_needed > 0:
            db = SessionLocal()
            try:
                # Query next batch of scanned or pending items
                pending_items = db.query(FtpUploadLog).filter(
                    FtpUploadLog.status.in_(['scanned', 'pending'])
                ).order_by(FtpUploadLog.id.asc()).limit(slots_needed).all()
                
                if pending_items:
                    for item in pending_items:
                        # Lock item status to downing so no other worker picks it up
                        item.status = 'downing'
                        db.commit()
                        
                        fut = executor.submit(process_single_log, item.id)
                        active_futures.add(fut)
                        
                    print(f"[continuous_pipeline] Refilled {len(pending_items)} workers. Active in-flight: {len(active_futures)}/{MAX_PARALLEL_WORKERS}")
            except Exception as ex:
                print(f"[continuous_pipeline] Error querying/dispatching logs: {ex}")
            finally:
                db.close()
                
        # If no active futures and no pending items, wait a bit
        if len(active_futures) == 0:
            time.sleep(3)
        else:
            time.sleep(0.3)


if __name__ == '__main__':
    main()

