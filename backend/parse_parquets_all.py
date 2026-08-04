import os
import sys
import json
import zipfile
import tempfile
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
import pandas as pd
from app.api.deps import get_db
from app.models.lot import Lot
from app.services.parsers import parse_file

def process_one_parquet(lot_id_int):
    from app.db.session import SessionLocal
    db = SessionLocal()
    try:
        lot = db.query(Lot).filter(Lot.id == lot_id_int).first()
        if not lot or not lot.storage_path or not os.path.exists(lot.storage_path):
            return False
            
        file_path = lot.storage_path
        tmp_dir = tempfile.mkdtemp()
        target_csv_path = file_path
        
        if file_path.endswith('.zip'):
            try:
                with zipfile.ZipFile(file_path, 'r') as z:
                    z.extractall(tmp_dir)
                    extracted = [os.path.join(tmp_dir, f) for f in os.listdir(tmp_dir) if f.endswith('.csv') or f.endswith('.txt')]
                    if extracted:
                        target_csv_path = extracted[0]
            except Exception:
                return False
                
        try:
            res = parse_file(target_csv_path)
        except Exception:
            res = None
            
        try:
            import shutil
            shutil.rmtree(tmp_dir, ignore_errors=True)
        except Exception:
            pass
            
        if res is None or res.data is None or res.data.empty:
            return False
            
        parquet_dir = "/app/uploads/parquet"
        os.makedirs(parquet_dir, exist_ok=True)
        parquet_path = os.path.join(parquet_dir, f"lot_{lot.id}.parquet")
        res.data.to_parquet(parquet_path, index=False)
        
        lot.parquet_path = parquet_path
        lot.station_count = int(res.data["SITE_NUM"].nunique()) if "SITE_NUM" in res.data.columns else 1
        
        bin_col = None
        if "HARD_BIN" in res.data.columns:
            bin_col = "HARD_BIN"
        elif "SOFT_BIN" in res.data.columns:
            bin_col = "SOFT_BIN"
            
        if bin_col:
            series = pd.to_numeric(res.data[bin_col], errors='coerce')
            pass_cnt = int((series.isin([1, 2])).sum())
            total_cnt = len(res.data)
            fail_cnt = total_cnt - pass_cnt
            lot.pass_count = pass_cnt
            lot.fail_count = fail_cnt
            lot.yield_rate = round((pass_cnt / total_cnt) * 100, 2) if total_cnt > 0 else 0.0
            
            bin_cnts = series.value_counts().to_dict()
            bin_dict = {}
            for k, v in bin_cnts.items():
                if pd.notnull(k):
                    bin_dict[str(int(k))] = int(v)
            lot.bin_summary = json.dumps(bin_dict)
            
        db.commit()
        return True
    except Exception as e:
        db.rollback()
        return False
    finally:
        db.close()

def main():
    db = next(get_db())
    lot_ids = [r[0] for r in db.query(Lot.id).filter(Lot.parquet_path == None, Lot.data_type == 'CP', ~Lot.filename.ilike('%(QA)%')).all()]
    print(f"Total CP lots to build parquet: {len(lot_ids)}")
    
    completed = 0
    total = len(lot_ids)
    start_time = time.time()
    
    with ThreadPoolExecutor(max_workers=8) as executor:
        futures = {executor.submit(process_one_parquet, lid): lid for lid in lot_ids}
        for future in as_completed(futures):
            completed += 1
            if completed % 100 == 0 or completed == total:
                elapsed = time.time() - start_time
                speed = completed / elapsed if elapsed > 0 else 0
                print(f"[parquet_build] Progress: {completed}/{total} ({completed/total*100:.1f}%) Speed: {speed:.1f} lots/sec")

if __name__ == '__main__':
    main()