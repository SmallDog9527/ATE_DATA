from app.core.database import SessionLocal
from app.api.routes.programs import _build_data_program_list

db = SessionLocal()
rows = _build_data_program_list(db, 'HL5083A', 3650, 120.0)
print("COUNT:", len(rows))
for r in rows:
    print(r.get("index"), r.get("id"), r.get("program"), r.get("filename"), r.get("source_type"), r.get("test_date"))
