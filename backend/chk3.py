from app.core.database import SessionLocal
from app.models.lot import Lot
from app.api.routes.programs import _get_lot_data_params, _data_version_signature

db = SessionLocal()
for lid in [194916, 85345, 30495, 39500]:
    lot = db.query(Lot).filter(Lot.id == lid).first()
    p = _get_lot_data_params(db, lid)
    sig = _data_version_signature(p, [])
    print(f"lot_id: {lid}, filename: {lot.filename}, source: {lot.data_source}, sig_hash: {hash(sig)}, sig_len: {len(sig)}")
