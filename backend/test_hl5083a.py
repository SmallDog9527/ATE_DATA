from app.core.database import SessionLocal
from app.api.routes.programs import update_all_program_changes_snapshot
from app.models.program_data_snapshot import ProgramDataSnapshot
import json

db = SessionLocal()
update_all_program_changes_snapshot(db, "HL5083A")
snap = db.query(ProgramDataSnapshot).filter(ProgramDataSnapshot.product_name == "HL5083A").first()
if snap:
    rows = json.loads(snap.rows_json)
    print("HL5083A NEW COUNT:", len(rows))
    for r in rows:
        print(r.get("index"), r.get("id"), r.get("program"), r.get("filename"), r.get("source_type"), r.get("test_date"))
