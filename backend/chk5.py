from app.core.database import SessionLocal
from app.api.routes.programs import _get_lot_data_params

db = SessionLocal()
p194916 = {q["param"]: q for q in _get_lot_data_params(db, 194916)}
p85345 = {q["param"]: q for q in _get_lot_data_params(db, 85345)}

for k, v1 in p194916.items():
    v2 = p85345.get(k)
    if not v2:
        print("Missing in 85345:", k)
    elif v1["min"] != v2["min"] or v1["max"] != v2["max"]:
        print("differ:", k, v1["min"], v1["max"], "vs", v2["min"], v2["max"])
