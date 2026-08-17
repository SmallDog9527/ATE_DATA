import sys, os
sys.path.insert(0, '/home/qqATE/backend')
from app.core.database import SessionLocal
from app.models.lot import Lot
db = SessionLocal()
for r in db.query(Lot).limit(5):
    print(repr(r.id), '|', repr(r.lot_id), '|', repr(r.wafer_id), '|', repr(r.filename))
db.close()