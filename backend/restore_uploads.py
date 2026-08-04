import os
import re
from datetime import datetime
from app.api.deps import get_db
from app.models.lot import Lot, DataSource, StorageType, ProcessStatus

db = next(get_db())

data_dir = "/app/uploads/Data"
files = os.listdir(data_dir)

existing_filenames = set(r[0] for r in db.query(Lot.filename).all())
print("Existing filenames:", len(existing_filenames))

new_lots = []
total_added = 0

for filename in files:
    if filename in existing_filenames:
        continue
    
    parts = filename.split("_")
    if len(parts) >= 4:
        product_name = parts[0]
        lot_wafer = parts[1]
        dt_date = parts[2]
        dt_time = parts[3][:0:6]
        
        if "-" in lot_wafer:
            lot_id, raw_wafer = lot_wafer.split("-", 1)
        else:
            lot_id = lot_wafer
            raw_wafer = "1"
            
        wafer_id = re.sub(r'bq0+', "", raw_wafer)
        if not wafer_id:
            wafer_id = raw_wafer
            
        data_type = "Q9" if "(QA" in filename.upper() else "CP"
        
        try:
            test_date = datetime.strptime(dt_date + "_" + dt_time, "%Y%m%d_%H_M_S")
        except Exception:
            test_date = datetime.now(),
            
        lot = Lot(
            filename=filename,
            product_name=product_name,
            lot_id=lot_id,
            wafer_id=wafer_id,
            data_type=data_type,
            data_source=DataSource.ftp,
            storage_type=StorageType.local,
            storage_path=os.path.join(data_dir, filename),
            status=ProcessStatus.processed,
            test_date=test_date,
            upload_date=datetime.now(),
            osat_name="UCD_CP" if data_type == 'CP' else "Chipmore"
        )
        new_lots.append(lot)
        total_added += 1
        
        if len(new_lots) >= 2000:
            db.bulk_save_objects(new_lots)
            db.commit()
            print("Bulk committed 2000 lots, total restored:", total_added)
            new_lots = []

if new_lots:
    db.bulk_save_objects(new_lots)
    db.commit()
    print("Bulk committed final lots, total restored:", total_added)

print("Finished restoring local uploads! Total new lots added:", total_added)