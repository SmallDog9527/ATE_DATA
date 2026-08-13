from app.core.database import SessionLocal
from app.models.program_data_snapshot import ProgramDataSnapshot
import json

db = SessionLocal()
snap = db.query(ProgramDataSnapshot).filter(ProgramDataSnapshot.product_name == 'HL5083A').first()
if snap:
    rows = json.loads(snap.rows_json)
    for r in rows[1:5]:
        print("========================================")
        for k, v in r.items():
            print(k, ":", v)
