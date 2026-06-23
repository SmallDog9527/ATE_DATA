import os
import sys
import json

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from app.core.database import SessionLocal
from app.models.pgs_upload import PgsUpload
from app.core.config import settings

def main():
    db = SessionLocal()
    try:
        # Get V08 summary
        v08_rec = db.query(PgsUpload).filter(PgsUpload.id == 4).first()
        if not v08_rec or not v08_rec.parsed_summary:
            print("V08 summary not found in DB")
            return
            
        v08_summary = json.loads(v08_rec.parsed_summary)
        v08_bin_names = {row['bin_name'] for row in v08_summary}
        print(f"V08 Bin names ({len(v08_bin_names)}): {sorted(list(v08_bin_names))}")
        
        # Load V10 PGS file content
        base_name = "HL5083ACP00_204KM_A00_V10"
        pgs_path = os.path.join(settings.UPLOAD_DIR, "pgs_extract", base_name, base_name + ".pgs")
        if not os.path.exists(pgs_path):
            print(f"V10 PGS file not found: {pgs_path}")
            return
            
        with open(pgs_path, "r", encoding="utf-8", errors="ignore") as f:
            content = f.read()
            
        found_names = []
        missing_names = []
        for name in v08_bin_names:
            if name in content:
                found_names.append(name)
            else:
                missing_names.append(name)
                
        print(f"\nBin names found in V10 PGS file: {sorted(found_names)}")
        print(f"Bin names missing in V10 PGS file: {sorted(missing_names)}")
        
    finally:
        db.close()

if __name__ == "__main__":
    main()
