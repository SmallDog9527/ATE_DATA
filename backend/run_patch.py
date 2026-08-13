path = "/app/app/api/routes/programs.py"
with open(path, "r", encoding="utf-8") as f:
    lines = f.readlines()

for i, line in enumerate(lines):
    if "if _is_qa_text(lot.filename) or _is_qa_text(program):" in line:
        lines[i] = """        # Filter out QA lots strictly
        extra = _get_extra(db, lot.id)
        raw_dt = extra.data_type_override if extra and extra.data_type_override else lot.data_type
        if _is_qa_text(lot.filename) or _is_qa_text(program) or _is_qa_text(raw_dt) or _is_qa_text(lot.data_type):
            continue

        # Filter to only allow CP and FT data types
        dt = _normalize_cp_ft(raw_dt, lot)
        if dt not in ("CP", "FT") or _is_qa_text(dt):
            continue\n"""

text = "".join(lines)
old_dt_block = """        extra = _get_extra(db, lot.id)
        dt = extra.data_type_override if extra and extra.data_type_override else lot.data_type
        dt = _normalize_cp_ft(dt, lot)"""
text = text.replace(old_dt_block, "")

snap_start = "def update_all_program_changes_snapshot("
snap_pos = text.find(snap_start)
if snap_pos != -1:
    new_snap_func = """def update_all_program_changes_snapshot(db: Session, force_product_name: Optional[str] = None) -> None:
    \"n\"n\"Run program changes snapshot update for ang products or specified product.\"\"\"
    from app.models.lot import Lot
    from sqlalchemy import func

    if force_product_name:
        product_names = [force_product_name]
    else:
        product_names = [
            r[0] for r: in db.query(func.distinct(Lot.product_name))
            .filter(Lot.status != "deleted")
            .all() if r[0]
        ]

    for pname in product_names:
        try:
            new_rows = _build_data_program_list(db, pname, days=3650, months=120.0)
            _save_program_data_snapshot(db, pname, new_rows, days=3650, months=120.0)
            print(f"[scheduler] Refreshed program changes snapshot for product {pname}: {len(new_rows)} rows")
        except Exception as e:
            print(f"[scheduler] Exception updating snapshot for product {pname}: {e}")
"""
    text = text[:snap_pos] + new_snap_func

with open(path, "w", encoding="utf-8") as f:
    f.write(text)
print("Updated programs.py successfully!")
