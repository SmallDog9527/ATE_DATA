import sys
import os
import json

# Add parent directory to sys.path so we can import app modules
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy.orm import Session
from app.core.database import SessionLocal
from app.models.pgs_upload import PgsUpload

def main():
    db = SessionLocal()
    try:
        # Search for uploads with HL5083 in filename
        records = db.query(PgsUpload).filter(PgsUpload.filename.like("%HL5083%")).all()
        print(f"Found {len(records)} records matching 'HL5083':")
        for rec in records:
            print("-" * 50)
            print(f"ID: {rec.id}")
            print(f"Filename: {rec.filename}")
            print(f"Product Name: {rec.product_name}")
            print(f"Upload Date: {rec.upload_date}")
            print(f"Program Version: {rec.program_version}")
            print(f"PGS Version: {rec.pgs_version}")
            print(f"Parse Status: {rec.parse_status}")
            print(f"Parse Error: {rec.parse_error}")
            
            # Check parsed_params
            if rec.parsed_params:
                params = json.loads(rec.parsed_params)
                print(f"Parsed Params count: {len(params)}")
            else:
                print("Parsed Params: None")
                
            # Check parsed_summary
            if rec.parsed_summary:
                summary = json.loads(rec.parsed_summary)
                print(f"Parsed Summary count: {len(summary)}")
                if len(summary) > 0:
                    print("First few summary rows:")
                    for row in summary[:5]:
                        print(row)
            else:
                print("Parsed Summary: None")
    except Exception as e:
        print(f"Error: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    main()
