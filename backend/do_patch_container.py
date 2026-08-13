import os

filepath = "/app/app/api/routes/programs.py"
with open(filepath, "r", encoding="utf-8") as f:
    text = f.read()

# 1. Update QA filter inside _build_data_program_list
qa_old = '        if _is_qa_text(lot.filename) or _is_qa_text(program):
            continue'
qa_new = '''        # Filter out QA lots strictly
        extra = _get_extra(db, lot.id)
        raw_dt = extra.data_type_override if extra and extra.data_type_override else lot.data_type
        if _is_qa_text(lot.data_type) or _is_qa_text(lot.filename) or _is_qa_text(program) or _is_qa_text(raw_dt):
            continue

        # Filter to only allow CP and FT data types
        dt = _normalize_cp_ft(raw_dt, lot)
        if dt not in ("CP", "FT") or _is_qa_text(dt):
            continue'''

if qa_old in text:
    text = text.replace(qa_old, qa_new)
    print("Replaced qa_old successfully.")

# Remove second extra/dt block if exists
dup_dt = '''        extra = _get_extra(db, lot.id)
        dt = extra.data_type_override if extra and extra.data_type_override else lot.data_type
        dt = _normalize_cp_ft(dt, lot)'''

if dup_dt in text:
    text = text.replace(dup_dt, '')
    print("Removed duplicate dt calculation.")

# 2. Update update_all_program_changes_snapshot
snap_sig = "def update_all_program_changes_snapshot("
idx = text.find(snap_sig)
if idx != -1:
    new_snap = '''def update_all_program_changes_snapshot(db: Session, force_product_name: Optional[str] = None) -> None:
    """Run program changes snapshot update for ang products or specified product."""
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
'''
    text = text[:idx] + new_snap
    print("Replaced update_all_program_changes_snapshot successfully.")

with open(filepath, "w", encoding="utf-8") as f:
    f.write(text)

print("Saved file on host.")
