import os
import sys

# Add backend directory to sys.path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.core.database import SessionLocal
from app.models.pgs_upload import PgsUpload

db = SessionLocal()
try:
    latest_records = db.query(PgsUpload).order_by(PgsUpload.id.desc()).limit(5).all()
    for record in latest_records:
        print("="*40)
        print(f"ID: {record.id}")
        print(f"Filename: {record.filename}")
        print(f"Status: {record.parse_status}")
        print(f"Error: {record.parse_error}")
finally:
    db.close()
