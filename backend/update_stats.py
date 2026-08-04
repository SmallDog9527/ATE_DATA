import os
import json
import pandas as pd
from app.api.deps import get_db
from app.models.lot import Lot

db = next(get_db())
lots = db.query(Lot).filter(Lot.lot_id == 'A0C7878', Lot.parquet_path != None).all()

for lot in lots:
    if not os.path.exists(lot.parquet_path):
        continue
    df = pd.read_parquet(lot.parquet_path)
    bin_col = None
    if "HARD_BIN" in df.columns:
        bin_col = "HARD_BIN"
    elif "SOFT_BIN" in df.columns:
        bin_col = "SOFT_BIN"
        
    if bin_col:
        series = pd.to_numeric(df[bin_col], errors='coerce')
        pass_cnt = int((series.isin([1, 2])).sum())
        total_cnt = len(df)
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
print("Updated summary stats!")