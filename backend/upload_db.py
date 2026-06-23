import os
import sys
import json

from app.core.database import SessionLocal
from app.models.pgs_upload import PgsUpload

def insert_db():
    json_path = "/app/uploads/parsed_t2k.json"
    with open(json_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
        
    params = data['params']
    summary = data['summary']
    
    filename = "HL5501WL01_102_V03_T32"
    product_name = "HL5501WL01"
    program_version = "V03"
    
    db = SessionLocal()
    try:
        existing = db.query(PgsUpload).filter(PgsUpload.filename == filename).first()
        if existing:
            existing.parsed_params = json.dumps(params)
            existing.parsed_summary = json.dumps(summary)
            existing.program_version = program_version
            existing.product_name = product_name
            existing.parse_status = "ok"
            upload = existing
        else:
            upload = PgsUpload(
                filename=filename,
                product_name=product_name,
                program_version=program_version,
                parse_status="ok",
                parsed_params=json.dumps(params),
                parsed_summary=json.dumps(summary)
            )
            db.add(upload)
            
        db.commit()
        print(f"Successfully inserted into DB. Upload ID: {upload.id}")
    finally:
        db.close()

if __name__ == "__main__":
    insert_db()
