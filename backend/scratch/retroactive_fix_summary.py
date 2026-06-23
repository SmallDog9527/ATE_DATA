import sys
import os
import json

# Add parent directory to sys.path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy.orm import Session
from app.core.database import SessionLocal
from app.models.pgs_upload import PgsUpload

def main():
    db = SessionLocal()
    try:
        # Find all records with parse_status = 'ok' and parsed_summary = '[]'
        records = db.query(PgsUpload).filter(
            PgsUpload.parse_status == "ok",
            PgsUpload.parsed_summary == "[]"
        ).all()
        
        print(f"Found {len(records)} records with empty summaries to fix:")
        
        for rec in records:
            print("-" * 50)
            print(f"Fixing ID: {rec.id}, Filename: {rec.filename}, Product Name: {rec.product_name}")
            
            # Load params to get distinct (sw_bin, hw_bin)
            if not rec.parsed_params:
                print("  Skipping: no parsed params found")
                continue
                
            params = json.loads(rec.parsed_params)
            distinct_bins = {}
            for p in params:
                sb = p.get("sw_bin")
                hb = p.get("hw_bin")
                if sb is not None and hb is not None:
                    distinct_bins[sb] = hb
                    
            if not distinct_bins:
                print("  Skipping: no distinct bins found in parameters")
                continue
                
            # Find the latest upload for the same product with a non-empty summary
            prev_upload = db.query(PgsUpload).filter(
                PgsUpload.product_name == rec.product_name,
                PgsUpload.parse_status == "ok",
                PgsUpload.parsed_summary.isnot(None),
                PgsUpload.parsed_summary != "[]",
                PgsUpload.id != rec.id
            ).order_by(PgsUpload.upload_date.desc()).first()
            
            if not prev_upload:
                print(f"  Skipping: no historical program with summary found for product {rec.product_name}")
                continue
                
            print(f"  Found historical source program ID: {prev_upload.id} ({prev_upload.filename})")
            
            try:
                prev_summary = json.loads(prev_upload.parsed_summary)
                prev_map = {row["sw_bin"]: row.get("bin_name") for row in prev_summary if row.get("bin_name")}
                
                inherited_summary = []
                for sb, hb in sorted(distinct_bins.items()):
                    bin_name = prev_map.get(sb, "")
                    inherited_summary.append({
                        "sw_bin": sb,
                        "hw_bin": hb,
                        "bin_name": bin_name
                    })
                    
                if inherited_summary:
                    rec.parsed_summary = json.dumps(inherited_summary, ensure_ascii=False)
                    db.commit()
                    print(f"  Successfully fixed summary! Inherited {len(inherited_summary)} bin definitions.")
                else:
                    print("  No bins inherited (inherited list empty)")
            except Exception as ex:
                db.rollback()
                print(f"  Error processing record {rec.id}: {ex}")
                
    finally:
        db.close()

if __name__ == "__main__":
    main()
