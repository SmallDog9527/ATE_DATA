import os
import json
import zipfile
import tempfile
import pandas as pd
from app.api.deps import get_db
from app.models.lot import Lot
from app.services.parsers import parse_file

db = next(get_db())
lots = db.query(Lot).filter(Lot.lot_id == 'A0C7878', Lot.parquet_path == None).all()
print("Dound A0C7878 lots to build parquet:", len(lots))

count = 0
for lot in lots:
    if not lot.storage_path or not os.path.exists(lot.storage_path):
        continue
    
    file_path = lot.storage_path
    tmp_dir = tempfile.mkdtemp()
    target_csv_path = file_path
    
    if file_path.endswith('.zip'):
        try:
            with zipfile.ZipFile(file_path, 'r') as z:
                names = z.namelist()
                if names:
                    z.extract(names[0], tmp_dir)
                    target_csv_path = os.path.join(tmp_dir, names[0])
        except Exception as e:
            print("Unzip error:", lot.id, e)
            continue
            
    res = parse_file(target_csv_path)
    
    try:
        import shutil
        shutil.rmtree(tmp_dir, ignore_errors=True)
    except Exception:
        pass
        
    if res is None or res.data is None or res.data.empty:
        print("Parse error for lot:", lot.id, res.error if res else 'None')
        continue
        
    parquet_dir = "/app/uploads/parquet"
    os.makedirs(parquet_dir, exist_ok=True)
    parquet_path = os.path.join(parquet_dir, f"lot_{lot.id}.parquet")
    res.data.to_parquet(parquet_path, index=False)
    
    lot.parquet_path = parquet_path
    lot.station_count = int(res.data["SITE_NUM"].nunique()) if "SITE_NUM" in res.data.columns else 1
    
    pass_bins = [1, 2]
    if "HARD_BIN" in res.data.columns:
        pass_cnt = int((res.data["HARD_BIN"].isin(pass_bins)).sum())
        total_cnt = int(len(res.data))
        fail_cnt = total_cnt - pass_cnt
        lot.pass_count = pass_cnt
        lot.fail_count = fail_cnt
        lot.yield_rate = round((pass_cnt / total_cnt) * 100, 2) if total_cnt > 0 else 0.0
        
        bin_counts = res.data["HARD_BIN"].value_counts().to_dict()
        lot.bin_summary = json.dumps({str(k): int(v) for k, v in bin_counts.items()})

    db.commit()
    count += 1
    print("Built parquet for Lot %d (Wafer %s): Pass=%s Fail=%s Yield=%s%%" % (lot.id, lot.wafer_id, lot.pass_count, lot.fail_count, lot.yield_rate))

print("Done processing A0C7878 lots! Total processed:", count)