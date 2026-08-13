from app.core.database import SessionLocal
from app.models.program_data_snapshot import ProgramDataSnapshot
import json

db = SessionLocal()
snap = db.query(ProgramDataSnapshot).filter(ProgramDataSnapshot.product_name == 'HL5083A').first()
if snap:
    rows = json.loads(snap.rows_json)
    print("COUNT:", len(rows))
    for r in rows:
        print(r.get("index"), r.get("id"), r.get("lot_id"), r.get("program"), r.get("filename"), r.get("test_date"))
