from app.core.database import SessionLocal
from app.api.routes.programs import update_all_program_changes_snapshot

db = SessionLocal()
print("[snapshot] Starting full snapshot regeneration for all products...")
update_all_program_changes_snapshot(db)
print("[snapshot] Completed full snapshot regeneration successfully!")
