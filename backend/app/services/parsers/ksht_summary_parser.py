import os
import re
import openpyxl
from datetime import datetime
from sqlalchemy.orm import Session
from app.models.lot import Lot, DataSource, ProcessStatus
from app.models.bin_summary import BinSummary
from app.services.parsers.identity import normalize_lot_id, normalize_wafer_id

def parse_ksht_date(val):
    if not val:
        return None
    s = str(val).strip()
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y/%m/%d %H:%M:%S", "%Y-%m-%d %H:%M", "%Y/%m/%d %H:%M"):
        try:
            return datetime.strptime(s, fmt)
        except ValueError:
            pass
    return None

def extract_date_from_filename(filename: str):
    """
    Extract timestamp from summary report filename.
    Supports 14-digit format: YYYYMMDDHHMMSS (e.g. 20230110103001)
    and 8-digit format: YYYYMMDD (e.g. 20230110).
    """
    if not filename:
        return None
    m14 = re.search(r'(?:^|[^0-9])(20[12][0-9](?:0[1-9]|1[0-2])(?:0[1-9]|[12][0-9]|3[01])(?:[01][0-9]|2[0-3])[0-5][0-9][0-5][0-9])(?:[^0-9]|$)', filename)
    if m14:
        try:
            return datetime.strptime(m14.group(1), "%Y%m%d%H%M%S")
        except ValueError:
            pass
    m8 = re.search(r'(?:^|[^0-9])(20[12][0-9](?:0[1-9]|1[0-2])(?:0[1-9]|[12][0-9]|3[01]))(?:[^0-9]|$)', filename)
    if m8:
        try:
            return datetime.strptime(m8.group(1), "%Y%m%d")
        except ValueError:
            pass
    return None


def enrich_device_and_program(w_info: dict, db_sess: Session, cache: dict = None):
    """
    Enrich missing device_name (product_name) and program from raw test data
    (data_type != 'CP_Yield') in the lots table.
    """
    cur_lot = w_info.get("lot_id")
    cur_wafer = w_info.get("wafer_id")
    if not cur_lot:
        return

    dev = w_info.get("device_name")
    missing_dev = not dev or not str(dev).strip() or str(dev).strip().lower() in ("(unknown)", "unknown", "none", "null", "nan")

    prog = w_info.get("program")
    missing_prog = not prog or not str(prog).strip() or str(prog).strip().lower() in ("none", "null", "nan")

    if not missing_dev and not missing_prog:
        return

    prod_val = None
    prog_val = None
    tester_val = None

    # 1. Check cache first if provided
    if cache:
        cached_entry = cache.get((cur_lot, cur_wafer)) or cache.get(cur_lot)
        if cached_entry:
            prod_val = cached_entry.get("product_name")
            prog_val = cached_entry.get("program")
            tester_val = cached_entry.get("mp_tester")

    # 2. Query database if missing values not resolved by cache
    if (missing_dev and not prod_val) or (missing_prog and not prog_val):
        match = db_sess.query(Lot.product_name, Lot.program, Lot.mp_tester).filter(
            Lot.lot_id == cur_lot,
            Lot.wafer_id == cur_wafer,
            Lot.data_type != 'CP_Yield',
            Lot.status != 'deleted',
            (Lot.product_name.isnot(None) & (Lot.product_name != '')) | (Lot.program.isnot(None) & (Lot.program != ''))
        ).order_by(Lot.id.desc()).first()

        if not match:
            match = db_sess.query(Lot.product_name, Lot.program, Lot.mp_tester).filter(
                Lot.lot_id == cur_lot,
                Lot.data_type != 'CP_Yield',
                Lot.status != 'deleted',
                (Lot.product_name.isnot(None) & (Lot.product_name != '')) | (Lot.program.isnot(None) & (Lot.program != ''))
            ).order_by(Lot.id.desc()).first()

        # Fallback to any existing record of the same lot (even CP_Yield) with valid product_name or program
        if not match:
            match = db_sess.query(Lot.product_name, Lot.program, Lot.mp_tester).filter(
                Lot.lot_id == cur_lot,
                Lot.status != 'deleted',
                (Lot.product_name.isnot(None) & (Lot.product_name != '')) | (Lot.program.isnot(None) & (Lot.program != ''))
            ).order_by(Lot.id.desc()).first()

        if match:
            if not prod_val and match.product_name:
                prod_val = match.product_name
            if not prog_val and match.program:
                prog_val = match.program
            if not tester_val and match.mp_tester:
                tester_val = match.mp_tester
            if cache is not None:
                cache[cur_lot] = {
                    "product_name": prod_val,
                    "program": prog_val,
                    "mp_tester": tester_val,
                }

    # 3. Deduce product_name from program prefix or ProductMapping if still missing
    if missing_dev and not prod_val:
        active_prog = prog_val or prog
        if active_prog and "_" in active_prog:
            prog_prefix = active_prog.split("_")[0].strip()
            try:
                from app.models.product_mapping import ProductMapping
                pm = db_sess.query(ProductMapping).filter(ProductMapping.program_prefix == prog_prefix).first()
                if pm and pm.product_name:
                    prod_val = pm.product_name
                else:
                    prod_val = prog_prefix
            except Exception:
                prod_val = prog_prefix

    # 4. Apply resolved values
    if missing_dev and prod_val:
        w_info["device_name"] = prod_val
    if missing_prog and prog_val:
        w_info["program"] = prog_val
    if not w_info.get("mp_tester") and tester_val:
        w_info["mp_tester"] = tester_val


def parse_and_save_ksht_summary(filepath: str, db: Session, user_id: int = None, osat_name: str = "HTKS", raw_cache: dict = None) -> list:

    """
    Parse KSHT XLSX summary reports (both Format 1 and Format 2)
    and save the parsed wafer data into the database.
    """
    filename = os.path.basename(filepath)
    file_dt = extract_date_from_filename(filename)
    print(f"[ksht_summary_parser] Parsing file: {filename} (file timestamp: {file_dt})")
    
    wb = openpyxl.load_workbook(filepath, data_only=True)
    sheet_names = wb.sheetnames
    
    parsed_wafers = []
    
    if "Lot" in sheet_names:
        # ?? Parse Format 1 ???????????????????????????????????????????????????
        print("[ksht_summary_parser] Detected Format 1 (with 'Lot' sheet)")
        sh_lot = wb["Lot"]
        device_name = ""
        lot_no_from_sheet = ""
        for r in range(1, sh_lot.max_row + 1):
            for c_idx in (1, 3):
                cell_k = sh_lot.cell(r, c_idx).value
                cell_v = sh_lot.cell(r, c_idx + 1).value
                if cell_k and cell_v:
                    k_str = str(cell_k).strip().lower()
                    if k_str in ("customer device", "device name", "device"):
                        if not device_name or k_str == "customer device":
                            device_name = str(cell_v).strip()
                    elif k_str in ("customer lot", "lotno", "lot no", "lot_no", "lot"):
                        if not lot_no_from_sheet or k_str == "customer lot":
                            lot_no_from_sheet = str(cell_v).strip()

        sh_sum = wb["Summary"]
        row1 = [sh_sum.cell(1, c).value for c in range(1, sh_sum.max_column + 1)]
        row2 = [sh_sum.cell(2, c).value for c in range(1, sh_sum.max_column + 1)]

        try:
            c_wafer = row1.index("Wafer")
        except ValueError:
            c_wafer = 0

        c_tester = row1.index("Tester") if "Tester" in row1 else -1
        c_probercard = row1.index("ProberCard") if "ProberCard" in row1 else -1
        c_started = row1.index("Started") if "Started" in row1 else -1
        c_finished = row1.index("Finished") if "Finished" in row1 else -1
        c_job = row1.index("Job") if "Job" in row1 else -1
        c_gross = row1.index("Gross") if "Gross" in row1 else -1

        # Locate Rate and Qty sections in row1/row2
        c_rate = -1
        c_qty_start = -1
        for idx, val in enumerate(row1):
            if val:
                val_upper = str(val).strip().upper()
                if val_upper == "RATE" and c_rate < 0:
                    c_rate = idx
                elif val_upper == "QTY" and c_qty_start < 0:
                    c_qty_start = idx

        if c_qty_start < 0:
            good_indices = [idx for idx, val in enumerate(row2) if val and str(val).strip().lower() in ("good 1st", "good")]
            if len(good_indices) >= 2:
                c_qty_start = good_indices[len(good_indices) // 2]

        # Find Good rate column under Rate section
        c_good_rate = -1
        if c_rate >= 0:
            for c in range(c_rate, c_qty_start if c_qty_start >= 0 else len(row2)):
                if row2[c] and str(row2[c]).strip().lower() == "good":
                    c_good_rate = c
                    break
        if c_good_rate < 0:
            c_good_rate = 9

        # Find Good qty column under Qty section
        c_good_qty = -1
        if c_qty_start >= 0:
            for c in range(c_qty_start, len(row2)):
                if row2[c] and str(row2[c]).strip().lower() == "good":
                    c_good_qty = c
                    break
        if c_good_qty < 0 and c_qty_start >= 0:
            c_good_qty = c_qty_start + 1

        # Bin mapping from Qty columns in row 2
        bin_cols = {}
        if c_qty_start >= 0:
            for c in range(c_qty_start, len(row2)):
                val = row2[c]
                if val is not None and str(val).strip().isdigit():
                    b_num = int(str(val).strip())
                    if 1 <= b_num <= 130:
                        bin_cols[c] = b_num

        # Iterate data rows starting from row 3
        for r in range(3, sh_sum.max_row + 1):
            wafer_key = sh_sum.cell(r, c_wafer + 1).value
            if not wafer_key or str(wafer_key).strip().lower() in ("total", "average", "percentage"):
                continue

            wafer_key_str = str(wafer_key).strip()

            # Extract and normalize lot_id and wafer_id
            m = re.match(r"^([^-]+)-(\d+)", wafer_key_str)
            if m:
                raw_lot = m.group(1).strip()
                raw_wafer = m.group(2).strip()
            else:
                raw_lot = lot_no_from_sheet or ""
                raw_wafer = wafer_key_str

            lot_id = normalize_lot_id(raw_lot) or normalize_lot_id(lot_no_from_sheet) or raw_lot
            wafer_id = normalize_wafer_id(raw_wafer) or (raw_wafer.zfill(2) if raw_wafer.isdigit() else raw_wafer)

            if not lot_id or not wafer_id:
                continue

            mp_tester = sh_sum.cell(r, c_tester + 1).value if c_tester >= 0 else None
            probecard = sh_sum.cell(r, c_probercard + 1).value if c_probercard >= 0 else None
            test_start = parse_ksht_date(sh_sum.cell(r, c_started + 1).value) if c_started >= 0 else None
            test_finish = parse_ksht_date(sh_sum.cell(r, c_finished + 1).value) if c_finished >= 0 else None
            if test_start is None and file_dt is not None:
                test_start = file_dt
            if test_finish is None and file_dt is not None:
                test_finish = file_dt
            program = sh_sum.cell(r, c_job + 1).value if c_job >= 0 else None
            die_count = sh_sum.cell(r, c_gross + 1).value

            yield_rate = None
            if c_good_rate >= 0:
                yield_val = sh_sum.cell(r, c_good_rate + 1).value
                if yield_val is not None:
                    try:
                        val_float = float(str(yield_val).replace('%', '').strip())
                        if val_float > 1.0:
                            val_float /= 100.0
                        yield_rate = round(val_float, 4)
                    except ValueError:
                        pass

            if die_count is not None:
                die_count = int(die_count)

            pass_count = None
            if c_good_qty >= 0:
                pass_val = sh_sum.cell(r, c_good_qty + 1).value
                if pass_val is not None:
                    try:
                        pass_count = int(round(float(pass_val)))
                    except (ValueError, TypeError):
                        pass

            if pass_count is None and die_count and yield_rate is not None:
                pass_count = int(round(die_count * yield_rate))

            sbin_counts = {}
            if pass_count is not None:
                sbin_counts[1] = pass_count

            for c_idx, b_num in bin_cols.items():
                qty_val = sh_sum.cell(r, c_idx + 1).value
                if qty_val is not None:
                    try:
                        sbin_counts[b_num] = int(round(float(qty_val)))
                    except (ValueError, TypeError):
                        pass

            parsed_wafers.append({
                "lot_id": lot_id,
                "wafer_id": wafer_id,
                "device_name": device_name,
                "mp_tester": mp_tester,
                "probecard": probecard,
                "test_start": test_start,
                "test_finish": test_finish,
                "program": program,
                "die_count": die_count,
                "pass_count": pass_count,
                "yield_rate": yield_rate,
                "sbin_counts": sbin_counts
            })

    else:
        # ── Parse Format 2 ───────────────────────────────────────────────────
        print("[ksht_summary_parser] Detected Format 2 (with 'Summary' sheet only)")
        sh_sum = wb["Summary"]
        header_row_idx = None
        for r in range(1, sh_sum.max_row + 1):
            val = sh_sum.cell(r, 1).value
            if val:
                val_str = str(val).strip().lower()
                if val_str in ("test start time", "lotno", "lot no", "lot_no"):
                    header_row_idx = r
                    break
                
        if header_row_idx is None:
            raise ValueError("Could not find header row in Summary sheet")
            
        row_headers = [sh_sum.cell(header_row_idx, c).value for c in range(1, sh_sum.max_column + 1)]
        
        c_started = row_headers.index("Test Start Time") if "Test Start Time" in row_headers else -1
        c_finished = row_headers.index("Test Finish Time") if "Test Finish Time" in row_headers else -1
        c_device = row_headers.index("Device Name") if "Device Name" in row_headers else -1
        c_wafer = row_headers.index("WaferID") if "WaferID" in row_headers else -1
        c_total = row_headers.index("Total") if "Total" in row_headers else -1
        c_pass = row_headers.index("Pass") if "Pass" in row_headers else -1
        c_yield = row_headers.index("Yield") if "Yield" in row_headers else -1
        c_lot = row_headers.index("LotNo") if "LotNo" in row_headers else (row_headers.index("Lot ID") if "Lot ID" in row_headers else -1)
        
        bin_cols = {}
        for c in range(len(row_headers)):
            val = row_headers[c]
            if val:
                val_str = str(val).strip().upper()
                if val_str.startswith("BIN "):
                    try:
                        b_num = int(val_str.split()[1])
                        bin_cols[c] = b_num
                    except Exception:
                        pass
                        
        for r in range(header_row_idx + 1, sh_sum.max_row + 1):
            wafer_key = sh_sum.cell(r, c_wafer + 1).value
            if not wafer_key or str(wafer_key).strip().lower() in ("total", "average", "percentage"):
                continue
                
            wafer_key_str = str(wafer_key).strip()
            
            # Read and normalize lot_id and wafer_id
            raw_lot = str(sh_sum.cell(r, c_lot + 1).value).strip() if c_lot >= 0 and sh_sum.cell(r, c_lot + 1).value else ""
            if raw_lot.lower() in ("total", "average", "percentage"):
                continue
                
            lot_id = normalize_lot_id(raw_lot) if raw_lot else None
            wafer_id = normalize_wafer_id(wafer_key_str)
            
            if not lot_id and "-" in wafer_key_str:
                lot_id = normalize_lot_id(wafer_key_str.split("-")[0].strip())
            if not lot_id and raw_lot:
                lot_id = raw_lot
                
            if not wafer_id:
                if raw_lot and raw_lot in wafer_key_str:
                    suffix = wafer_key_str.replace(raw_lot, "").strip("-_Ff")
                    if suffix.isdigit():
                        wafer_id = str(int(suffix)).zfill(2)
                    else:
                        wafer_id = suffix
                elif "-" in wafer_key_str:
                    m = re.match(r"^([^-]+)-(\d+)", wafer_key_str)
                    if m:
                        wafer_id = m.group(2).strip().zfill(2)
                    else:
                        wafer_id = wafer_key_str.split("-")[-1].strip()
                else:
                    wafer_id = wafer_key_str.zfill(2) if wafer_key_str.isdigit() else wafer_key_str
                    
            if not lot_id or not wafer_id:
                continue
                
            device_name = sh_sum.cell(r, c_device + 1).value if c_device >= 0 else ""
            test_start = parse_ksht_date(sh_sum.cell(r, c_started + 1).value) if c_started >= 0 else None
            test_finish = parse_ksht_date(sh_sum.cell(r, c_finished + 1).value) if c_finished >= 0 else None
            if test_start is None and file_dt is not None:
                test_start = file_dt
            if test_finish is None and file_dt is not None:
                test_finish = file_dt
            die_count = sh_sum.cell(r, c_total + 1).value
            pass_count = sh_sum.cell(r, c_pass + 1).value
            yield_val = sh_sum.cell(r, c_yield + 1).value
            
            if die_count is not None:
                die_count = int(die_count)
            if pass_count is not None:
                pass_count = int(pass_count)
                
            yield_rate = None
            if yield_val is not None:
                try:
                    yield_str = str(yield_val).replace('%', '').strip()
                    val_float = float(yield_str)
                    if val_float > 1.0:
                        val_float /= 100.0
                    yield_rate = round(val_float, 4)
                except ValueError:
                    pass
                    
            sbin_counts = {}
            if pass_count is not None:
                sbin_counts[1] = pass_count
                
            for c_idx, b_num in bin_cols.items():
                rate_val = sh_sum.cell(r, c_idx + 1).value
                if rate_val is not None:
                    try:
                        raw_str = str(rate_val).strip()
                        is_percent_text = '%' in raw_str
                        rate_str = raw_str.replace('%', '').replace(',', '').strip()
                        val_float = float(rate_str)
                        if is_percent_text:
                            # Percent text such as '97.56%' / '0.33%' -> count = die * percent / 100
                            sbin_counts[b_num] = int(round(die_count * val_float / 100.0))
                        elif 0 < val_float < 1.0:
                            # Numeric fraction such as 0.9756 -> count = die * fraction
                            sbin_counts[b_num] = int(round(die_count * val_float))
                        elif val_float <= 100.0:
                            # Numeric percent-point such as 97.56 -> count = die * value / 100
                            sbin_counts[b_num] = int(round(die_count * val_float / 100.0))
                        else:
                            # Numeric raw count (larger than any percent point)
                            sbin_counts[b_num] = int(round(val_float))
                    except ValueError:
                        pass
                        
            parsed_wafers.append({
                "lot_id": lot_id,
                "wafer_id": wafer_id,
                "device_name": device_name,
                "mp_tester": None,
                "probecard": None,
                "test_start": test_start,
                "test_finish": test_finish,
                "program": None,
                "die_count": die_count,
                "pass_count": pass_count,
                "yield_rate": yield_rate,
                "sbin_counts": sbin_counts
            })
            
    # ?? Save to Database ?????????????????????????????????????????????????????
    created_lots = []

    for w in parsed_wafers:
        lot_id = w["lot_id"]
        wafer_id = w["wafer_id"]
        enrich_device_and_program(w, db, raw_cache)

        # Check if lot with same lot_id, wafer_id and type already exists
        existing_lot = db.query(Lot).filter(
            Lot.lot_id == lot_id,
            Lot.wafer_id == wafer_id,
            Lot.data_type == 'CP_Yield',
            Lot.status != 'deleted'
        ).first()

        saved_storage_path = filepath
        if existing_lot and existing_lot.storage_path and not existing_lot.storage_path.startswith('/tmp'):
            saved_storage_path = existing_lot.storage_path
        elif filepath.startswith('/tmp'):
            zip_candidate = f"/app/uploads/Summary/{filename}.zip"
            if os.path.exists(zip_candidate):
                saved_storage_path = zip_candidate

        if existing_lot:
            # Complementary update: update metrics and supplement metadata if newly provided
            existing_lot.filename = filename
            existing_lot.storage_path = saved_storage_path
            existing_lot.file_size = os.path.getsize(filepath)
            existing_lot.status = ProcessStatus.processed
            if user_id:
                existing_lot.user_id = user_id
                existing_lot.data_source = DataSource.manual

            if w.get("device_name"):
                existing_lot.product_name = w["device_name"]

            # Hardware & program metadata: only update if new file provides them (do not overwrite with None)
            if w.get("mp_tester"):
                existing_lot.mp_tester = w["mp_tester"]
                existing_lot.test_machine = w["mp_tester"]
            if w.get("probecard"):
                existing_lot.probecard = w["probecard"]
            if w.get("program"):
                existing_lot.program = w["program"]

            # Time metadata: update if new file provides test times or from file timestamp fallback
            eff_finish = w.get("test_finish") or file_dt
            eff_start = w.get("test_start") or file_dt
            if eff_finish:
                existing_lot.test_date = eff_finish
                existing_lot.ending_time = eff_finish
            if eff_start:
                existing_lot.beginning_time = eff_start

            # Core test metrics: update with latest parsed numbers
            if w.get("die_count") is not None:
                existing_lot.die_count = w["die_count"]
            if w.get("pass_count") is not None:
                existing_lot.pass_count = w["pass_count"]
            if w.get("yield_rate") is not None:
                existing_lot.yield_rate = w["yield_rate"]
            if osat_name:
                existing_lot.osat_name = osat_name

            # Update BinSummary records (1 to 130)
            existing_bins = {
                b.bin_number: b for b in db.query(BinSummary).filter(BinSummary.lot_id == existing_lot.id).all()
            }
            die_cnt = existing_lot.die_count or 0
            for sbin_idx in range(1, 131):
                count = w["sbin_counts"].get(sbin_idx, 0)
                percentage = (count / die_cnt) * 100.0 if die_cnt > 0 else 0.0
                if sbin_idx in existing_bins:
                    bin_sum = existing_bins[sbin_idx]
                    bin_sum.count = count
                    bin_sum.percentage = percentage
                else:
                    bin_sum = BinSummary(
                        lot_id=existing_lot.id,
                        bin_number=sbin_idx,
                        bin_name=f"Sbin{sbin_idx}",
                        site=0,
                        count=count,
                        percentage=percentage,
                        data_range="final"
                    )
                    db.add(bin_sum)
            db.commit()
            created_lots.append(existing_lot)
        else:
            # Create new Lot record
            lot = Lot(
                filename=filename,
                storage_path=saved_storage_path,
                file_size=os.path.getsize(filepath),
                status=ProcessStatus.processed,
                data_source=DataSource.manual if user_id else DataSource.ftp,
                storage_type='local',
                upload_date=datetime.now(),
                user_id=user_id,

                product_name=w.get("device_name"),
                lot_id=lot_id,
                wafer_id=wafer_id,
                data_type='CP_Yield',
                test_stage='CP_Yield',
                test_machine=w["mp_tester"],
                mp_tester=w["mp_tester"],
                probecard=w["probecard"],
                program=w["program"],
                die_count=w["die_count"],
                pass_count=w["pass_count"],
                yield_rate=w["yield_rate"],
                osat_name=osat_name,
                test_date=w.get("test_finish") or w.get("test_start") or file_dt or datetime.now(),
                beginning_time=w.get("test_start") or file_dt,
                ending_time=w.get("test_finish") or w.get("test_start") or file_dt or datetime.now(),
            )

            db.add(lot)
            db.flush()

            # Save BinSummary records (1 to 130)
            for sbin_idx in range(1, 131):
                count = w["sbin_counts"].get(sbin_idx, 0)
                percentage = (count / w["die_count"]) * 100.0 if (w["die_count"] and w["die_count"] > 0) else 0.0

                bin_sum = BinSummary(
                    lot_id=lot.id,
                    bin_number=sbin_idx,
                    bin_name=f"Sbin{sbin_idx}",
                    site=0,
                    count=count,
                    percentage=percentage,
                    data_range="final"
                )
                db.add(bin_sum)

            db.commit()
            created_lots.append(lot)

    print(f"[ksht_summary_parser] Successfully parsed and saved {len(created_lots)} lots from {filename}.")
    return created_lots
