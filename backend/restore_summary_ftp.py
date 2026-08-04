import os
import sys
import json
import zipfile
import shutil
import tempfile
import time
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
import pandas as pd

# Add app to system path
sys.path.insert(0, "/app")

from app.api.deps import get_db
from app.core.database import SessionLocal
from app.models.lot import Lot, DataSource, StorageType, ProcessStatus
from app.models.ftp_upload_log import FtpUploadLog
from app.models.ftp_extracted_file import FtpExtractedFile
from app.models.osat_config import OsatConfig
from app.services.parsers.xls_summary_parser import parse_and_save_xls_summary
from app.services.parsers.summary_parser import parse_summary_txt, apply_summary_to_csv, find_corresponding_csv_filename

SUMMARY_DIR = "/app/uploads/Summary"
EXTRACTED_BASE = "/FTP/extracted"

def detect_osat_id(filename):
    fname_upper = filename.upper()
    if "UCD_CP" in fname_upper:
        return 2
    elif "UCD_FT" in fname_upper or "UCD" in fname_upper:
        return 3
    elif "LBS" in fname_upper:
        return 4
    elif "KS2" in fname_upper:
        return 7
    elif "KS" in fname_upper:
        return 5
    elif "JS" in fname_upper:
        return 6
    return 1  # Default Chipmore

def process_one_summary(file_info):
    filename, file_path, file_size = file_info
    db = SessionLocal()
    try:
        remote_path = os.path.join("/data/ATE_DATA/uploads/Summary", filename)
        osat_id = detect_osat_id(filename)
        
        # 1. Update or create FtpUploadLog with processing status
        log = db.query(FtpUploadLog).filter(FtpUploadLog.remote_path == remote_path).first()
        if not log:
            log = FtpUploadLog(
                osat_id=osat_id,
                remote_path=remote_path,
                filename=filename,
                status="processing",
                file_size=file_size
            )
            db.add(log)
            db.flush()
        else:
            log.status = "processing"
            log.error_msg = None
            db.flush()
            
        # 2. Update or create Lot with pending status
        storage_path = os.path.join(SUMMARY_DIR, filename)
        lot = db.query(Lot).where(
            (Lot.filename == filename) | (Lot.storage_path == storage_path)
        ).first()
        
        if not lot:
            lot = Lot(
                filename=filename,
                storage_path=storage_path,
                data_source=DataSource.ftp,
                storage_type=StorageType.local,
                file_size=file_size,
                status=ProcessStatus.pending
            )
            db.add(lot)
            db.flush()
        else:
            lot.status = ProcessStatus.pending
            db.flush()

        log.lot_id_created = lot.id
        db.commit()
        
        # 3. Extract zip file if applicable
        tmp_extract_dir = tempfile.mkdtemp(dir=EXTRACTED_BASE, prefix="summary_")
        target_parse_file = file_path
        
        if filename.endswith(".zip"):
            try:
                with zipfile.ZipFile(file_path, "r") as z:
                    z.extractall(tmp_extract_dir)
                    extracted = [
                        os.path.join(tmp_extract_dir, f) 
                        for f in os.listdir(tmp_extract_dir) 
                        if not f.startswith(".")
                    ]
                    if extracted:
                        target_parse_file = extracted[0]
            except Exception as ex:
                raise Exception(f"Unzip failed: {ex}")
                
        lower_target = target_parse_file.lower()
        
        # 4. Parse file and insert records into database
        if lower_target.endswith((".xls", ".xlsx")):
            parse_and_save_xls_summary(target_parse_file, db, user_id=lot.user_id, osat_name=lot.osat_name)
            lot.status = ProcessStatus.processed
        elif lower_target.endswith(".txt") and "ets" in lower_target:
            summary_data = parse_summary_txt(target_parse_file)
            if summary_data.get("beginning_time"):
                lot.beginning_time = summary_data["beginning_time"]
                lot.test_date = summary_data["beginning_time"]
            if summary_data.get("ending_time"):
                lot.ending_time = summary_data["ending_time"]
            if summary_data.get("tester"):
                lot.mp_tester = summary_data["tester"]
            if summary_data.get("probecard"):
                lot.probecard = summary_data["probecard"]
            if summary_data.get("program"):
                lot.program = summary_data["program"]
            if summary_data.get("lot_id"):
                lot.lot_id = summary_data["lot_id"]
            if summary_data.get("wafer_id"):
                lot.wafer_id = summary_data["wafer_id"]
            if summary_data.get("handler"):
                lot.handler = summary_data["handler"]
            lot.status = ProcessStatus.processed
            db.commit()
            
            # Apply summary attributes to corresponding CSV records
            csv_mapped_name = find_corresponding_csv_filename(lot.filename)
            csv_base = os.path.splitext(csv_mapped_name)[0]
            csv_lots = db.query(Lot).filter(
                Lot.filename.like(f"%{csv_base}%"),
                Lot.data_source == lot.data_source
            ).all()
            for csv_lot in csv_lots:
                apply_summary_to_csv(db, csv_lot.id, summary_data)
        else:
            # Fallback mark as processed
            lot.status = ProcessStatus.processed
            
        # Clean up temporary extracted directory
        shutil.rmtree(tmp_extract_dir, ignore_errors=True)
        
        log.status = "success"
        log.error_msg = None
        db.commit()
        return True
        
    except Exception as e:
        db.rollback()
        err_str = f"Parsing summary error: {str(e)}"
        print(f"[summary_ftp] Failed lot {filename}: {err_str}")
        try:
            db_err = SessionLocal()
            log_err = db_err.query(FtpUploadLog).filter(FtpUploadLog.remote_path == os.path.join("/data/ATE_DATA/uploads/Summary", filename)).first()
            if log_err:
                log_err.status = "failed"
                log_err.error_msg = err_str
            lot_err = db_err.query(Lot).filter(Lot.filename == filename).first()
            if lot_err:
                lot_err.status = ProcessStatus.failed
            db_err.commit()
            db_err.close()
        except Exception:
            pass
        return False
    finally:
        db.close()

def periodic_reporter(total_files, stop_event):
    """Prints stats every 5 minutes (300 seconds). All comments in English."""
    while not stop_event.is_set():
        time.sleep(300)
        if stop_event.is_set():
            break
        try:
            db = SessionLocal()
            from sqlalchemy import or_
            logs = db.query(FtpUploadLog).filter(
                or_(
                    FtpUploadLog.remote_path.ilike("%summary%"),
                    FtpUploadLog.filename.ilike("%.xls%"),
                    FtpUploadLog.filename.ilike("%summary%"),
                    FtpUploadLog.filename.ilike("%ets%")
                )
            ).all()
            success_c = len([l for l in logs if l.status == "success"])
            failed_c = len([l for l in logs if l.status == "failed"])
            pending_c = max(0, total_files - success_c - failed_c)
            db.close()
            print(f"[summary_ftp][5-MIN STATS] Total: {total_files} | Ingested (Success): {success_c} | Un-ingested (Pending): {pending_c} | Failed: {failed_c}")
        except Exception as e:
            print(f"[summary_ftp][5-MIN STATS ERROR] {str(e)}")

def main():
    os.makedirs(EXTRACTED_BASE, exist_ok=True)
    if not os.path.exists(SUMMARY_DIR):
        print(f"Summary directory {SUMMARY_DIR} does not exist!")
        return

    files = os.listdir(SUMMARY_DIR)
    file_list = []
    for f in files:
        fp = os.path.join(SUMMARY_DIR, f)
        if os.path.isfile(fp):
            file_list.append((f, fp, os.path.getsize(fp)))

    total = len(file_list)
    print(f"[summary_ftp] Starting batch summary scanning & parsing with 30 threads for {total} files...")

    # Start 5-minute periodic reporting thread
    stop_event = threading.Event()
    reporter_thread = threading.Thread(target=periodic_reporter, args=(total, stop_event), daemon=True)
    reporter_thread.start()

    completed = 0
    success_count = 0
    fail_count = 0
    start_time = time.time()

    # Configured with 30 worker threads for high concurrency
    with ThreadPoolExecutor(max_workers=30) as executor:
        futures = {executor.submit(process_one_summary, fi): fi for fi in file_list}
        for future in as_completed(futures):
            completed += 1
            res = future.result()
            if res:
                success_count += 1
            else:
                fail_count += 1

            if completed % 200 == 0 or completed == total:
                elapsed = time.time() - start_time
                speed = completed / elapsed if elapsed > 0 else 0
                print(f"[summary_ftp] Progress: {completed}/{total} ({completed/total*100:.1f}%) Success: {success_count} Fail: {fail_count} Speed: {speed:.1f} files/sec")

    stop_event.set()
    print(f"[summary_ftp] Finished batch summary parsing! Total: {total}, Succeeded: {success_count}, Failed: {fail_count}")

if __name__ == "__main__":
    main()
