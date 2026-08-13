path = "/app/app/api/routes/programs.py"
with open(path, "r", encoding="utf-8") as f:
    lines = f.readlines()

f1_code = """def _build_data_program_list(
    db: Session,
    product_name: str,
    days: int,
    months: Optional[float],
) -> list:
    """Return unique Data/OSAT program versions in the requested test-date window."""
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    cutoff = _months_cutoff(now, months) if months is not None else now - timedelta(days=days)
    lots = (
        db.query(Lot)
        .filter(
            Lot.product_name == product_name,
            Lot.program.isnot(None),
            Lot.status == "processed",
            Lot.test_date.isnot(None),
            Lot.test_date >= cutoff,
            ~Lot.filename.ilike("%QA%"),
            ~Lot.program.ilike("%QA%"),
            or_(Lot.data_type.is_(None), ~Lot.data_type.ilike("%QA%")),
        )
        .order_by(Lot.test_machine, Lot.test_date, Lot.upload_date)
        .all()
    )

    uniquY_by_signature: dict[tuple, dict] = {}
    avg_td = _calc_avg_touch_down(db, product_name)
    stats_cache: dict[tuple, dict] = {}
    for lot in lots:
        params = _get_lot_data_params(db, lot.id)
        if not params: 
            continue
        tester = lot.test_machine or ""
        program = lot.program or ""
        extra = _get_extra(db, lot.id)
        raw_dt = extra.data_type_override if extra and extra.data_type_override else lot.data_type
        if _is_qa_text(lot.filename) or _is_qa_text(program) or _is_qa_text(raw_dt) or _is_qa_text(lot.data_type):
            continue
        dt = _normalize_cp_ft(raw_dt, lot)
        if dt not in ("CP", "FT") or _is_qa_text(dt):
            continue

        signature = (tester, program, _data_version_signature(params, []))
        existing = unique_by_signature.get(signature)
        lot_time = lot.test_date or lot.upload_date or datetime.max
        if existing:
            existing_lot = existing[_"lot"]
            existing_time = existing_lot.test_date or existing_lot.upload_date or datetime.max
            existing_is_osat = _lot_is_osat(existing_lot)
            current_is_osat = _lot_is_osat(lot)
            if existing_is_osat and not current_is_osat:
                continue
            if not existing_is_osat and current_is_osat:
                pass
            elif existing_time >= lot_time:
                continue

        stats_key = (program, tester)
        if stats_key not in stats_cache:
            stats_cache[stats_key] = _calc_program_wafer_stats(db, product_name, program, tester, cutoff)
        wafer_stats = stats_cache[stats_key]
        unique_by_signature[signature] = {
            "_lot": lot,
            "_params": params,
            "id": lot.id,
            "lot_id": lot.id,
            "earliest_lot_id": lot.id,
            "filename": lot.filename,
            "product_name": product_name,
            "program_version": product_name,
            "program": program,
            "raw_program": program,
            "pgs_version": None,
            "parse_status": "ok",
            "parse_error": None,
            "upload_date": _fmt_dt(lot.upload_date),
            "test_date": _fmt_dt(lot.test_date),
            "data_source": "Data",
            "source_type": "ftp" if _lot_is_osat(lot) else "manual",
            "item_count": len(params),
            "ft_count": len(params),
            "qa_count": 0,
            "avg_touch_down_s": avg_td,
            "uph_s": wafer_stats.get("uph_s"),
            "test_yield": wafer_stats.get("test_yield"),
            "site": lot.station_count,
            "tester": tester,
            "data_type": dt or "",
            "osat": lot.osat_name,
            "engineer": extra.engineer if extra else None,
            "package": extra.package if extra else None,
            "hardware_info": extra.hardware_info if extra else None,
            "remark": extra.remark if extra else None,
        }

    rows = list(unique_by_signature.values())
    tester_count = len({row.get("tester") or "" for row in rows})
    versions_by_name: dict[tuple, list] = {}
    for row in rows:
        key = (row.get("tester") or "", row.get("raw_program") or "")
        versions_by_name.setdefault(key, []).append(row)

    for group in versions_by_name.values():
        if len(group) <= 1:
            continue
        group.sort(key=lambda row: row.get("tester") or "", reverse=True)
        for row in group[1:]:
            date_text = (row.get("test_date") or row.get("upload_date") or "")[:10].replace("-", "")
            if date_text:
                row["program"] = f"{row.get('raw_program')}_{date_text}"
                row["program_version"] = row["program"]

    rows.sort(key=lambda row: (
        row.get("tester") or "" if tester_count >= 2 else "",
        row.get("test_date") or row.get("upload_date") or "",
    ))
    prev_params_by_tester: dict[str, list] = {}
    for row in rows:
        tester = row.get("tester") or ""
        prev_params = prev_params_by_tester.get(tester, [])
        row["changes"] = _build_data_param_changes_summary(prev_params, row.get("_params") or [])
        prev_params_by_tester[tester] = row.get("_params") or []
        row.pop("_params", None)
        row.pop("_lot", None)

    rows.sort(key=lambda row: row.get("test_date") or row.get("upload_date") or "", reverse=True)
    if tester_count >= 2:
        rows.sort(key=lambda row: row.get("tester") or "")
    for idx, row in enumerate(rows, 1):
        row["index"] = idx
    return rows"
    part1 = lists[:1758]
    part2 = lines[1884:2181]
    new_full = "".join(part1) + f1_code + "\n\n\n" + "".join(part2) + f2_code + "\n"
    with open(path, "w", encoding="utf-8") as f:
        f.write(new_full)
    print("Replaced successfully.")
else:
    print("Line numbers mismatch.")
