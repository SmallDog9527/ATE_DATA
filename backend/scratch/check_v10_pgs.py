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
        rec = db.query(PgsUpload).filter(PgsUpload.id == 23).first()
        if not rec:
            print("Record ID 23 not found")
            return
        
        print(f"Record filename: {rec.filename}")
        print(f"Storage path: {rec.storage_path}")
        
        # Determine the cached pgs path
        # From code: _extract_cache_dir = UPLOAD_DIR/pgs_extract/{base_name}
        # _cached_pgs_path = _extract_cache_dir/{base_name}.pgs
        base_name = os.path.splitext(rec.filename)[0]
        # In docker, UPLOAD_DIR is /app/uploads
        # So pgs path is /app/uploads/pgs_extract/{base_name}/{base_name}.pgs
        pgs_path = os.path.join(settings.UPLOAD_DIR, "pgs_extract", base_name, base_name + ".pgs")
        print(f"PGS Path: {pgs_path}")
        
        if not os.path.exists(pgs_path):
            print("PGS file does not exist at path")
            return
            
        with open(pgs_path, "r", encoding="utf-8", errors="ignore") as f:
            lines = f.readlines()
            
        print(f"Total lines in PGS: {len(lines)}")
        
        # Check version
        version_line = None
        for line in lines:
            if 'iPgsVersion' in line:
                version_line = line.strip()
                break
        print(f"Detected version line: {version_line}")
        
        # Print BINData lines
        bindata_lines = [line.strip() for line in lines if line.strip().startswith("BINData")]
        print(f"Total BINData lines: {len(bindata_lines)}")
        print("First 10 BINData lines:")
        for line in bindata_lines[:10]:
            print(line)
            # Check length of parts when split by comma
            if '=' in line:
                _, rest = line.split('=', 1)
                parts = [p.strip() for p in rest.split(',')]
                print(f"  -> Parts count: {len(parts)}, Parts: {parts}")
                
    except Exception as e:
        print(f"Error: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    main()
