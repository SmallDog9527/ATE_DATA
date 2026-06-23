import sys
import os

# Add parent directory to sys.path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy.orm import Session
from app.core.database import SessionLocal
from app.models.pgs_upload import PgsUpload
from app.core.config import settings

def main():
    db = SessionLocal()
    try:
        # Check ID 4 (V08)
        rec = db.query(PgsUpload).filter(PgsUpload.id == 4).first()
        if not rec:
            print("Record ID 4 not found")
            return
        
        print(f"Record filename: {rec.filename}")
        base_name = os.path.splitext(rec.filename)[0]
        pgs_path = os.path.join(settings.UPLOAD_DIR, "pgs_extract", base_name, base_name + ".pgs")
        print(f"PGS Path: {pgs_path}")
        
        if not os.path.exists(pgs_path):
            print("PGS file does not exist at path")
            return
            
        with open(pgs_path, "r", encoding="utf-8", errors="ignore") as f:
            lines = f.readlines()
            
        print(f"Total lines in PGS: {len(lines)}")
        
        # Print BINData lines
        bindata_lines = [line.strip() for line in lines if line.strip().startswith("BINData")]
        print(f"Total BINData lines: {len(bindata_lines)}")
        print("First 15 BINData lines starting with 11 parts:")
        count = 0
        for line in bindata_lines:
            if '=' in line:
                _, rest = line.split('=', 1)
                parts = [p.strip() for p in rest.split(',')]
                if len(parts) >= 11:
                    print(line)
                    print(f"  -> Parts count: {len(parts)}, Parts: {parts}")
                    count += 1
                    if count >= 15:
                        break
                        
    except Exception as e:
        print(f"Error: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    main()
