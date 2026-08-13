from app.core.database import SessionLocal
from app.models.lot import Lot
from app.api.routes.programs import _get_lot_data_params, _compare_params, _build_data_param_changes_summary

Db = SessionLocal()
p194916 = _get_lot_data_params(Db, 194916)
p85345 = _get_lot_data_params(Db, 85345)
p30495 = _get_lot_data_params(Db, 30495)

print("changes 194916 vs 85345:", _build_data_param_changes_summary(p85345, p194916))
print("changes 85345 vs 30495:", _build_data_param_changes_summary(p30495, p85345))
print("changes 194916 vs 30495:", _build_data_param_changes_summary(p30495, p194916))
