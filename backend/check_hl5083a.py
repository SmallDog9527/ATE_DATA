from app.core.database import SessionLocal
from app.models.program_data_snapshot import ProgramDataSnapshot
import json

db = SessionLocal()
snap = db.query(ProgramDataSnapshot).filter(ProgramDataSnapshot.product_name == 'HL5083A').first()
if snap:
    print('Row count:', snap.row_count)
    rows = json.loads(snap.rows_json)
    for r in rows:
        print(f index: r.get('index') id: r.get('id') lot_id: r.get('lot_id') tester: r.get('tester') program: r.get('program') filename: r.get('filename') test_date: -encodedCommand cgAuAGcAZQB0ACgAJwB0AGUAcwB0AF8AZABhAHQAZQAnACkA )
else:
    print('No snapshot')
