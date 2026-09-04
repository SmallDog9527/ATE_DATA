import os
import re
import pandas as pd
from datetime import datetime
from sqlalchemy.orm import Session
from app.models.lot import Lot, DataSource, ProcessStatus
from app.models.bin_summary import BinSummary
from app.services.parsers.identity import normalize_lot_id, normalize_wafer_id

def parse_xls_date(date_str: str) -> datetime:
    """
    Parse date string from summary files.
    Supports YYYYMMDDHHMMSS (14 digits) and YYMMDDHHMMSS (12 digits).
    """
    if not date_str:
        return None
    s = str(date_str).strip().split('.')[0] # Remove decimal part if any
    
    # Try 14-digit format: YYYYMMDDHHMMSS
    if len(s) == 14:
        try:
            return datetime.strptime(s, "%Y%m%d%H%M%S")
        except ValueError:
            pass
            
    # Try 12-digit format: YYMMDDHHMMSS
    if len(s) == 12:
        try:
            return datetime.strptime(s, "%y%m%d%H%M%S")
        except ValueError:
            pass
            
    # Fallback parsing
    from app.services.parsers.summary_parser import parse_summary_datetime
    return parse_summary_datetime(s)

def parse_and_save_chipmore_summary(filepath: str, db: Session, user_id: int = None, osat_name: str = "Chipmore") -> list:
    """
    Parse Chipmore XLS/XLSX summary reports and extract wafer information to save to the database.
    """
    xl = pd.ExcelFile(filepath)
    filename = os.path.basename(filepath)
    
    # Read the main summary sheet (first sheet)
    df0 = xl.parse(0, header=None)
    
    # Get global metadata: Device Name and Test Date
    device_name = ""
    global_test_date = None
    
    for r in range(min(5, df0.shape[0])):
        for c in range(df0.shape[1]):
            val = df0.iloc[r, c]
            if pd.notna(val):
                val_str = str(val).strip().lower()
                if "device name" in val_str or val_str == "device":
                    for next_c in range(c + 1, df0.shape[1]):
                        c_val = df0.iloc[r, next_c]
                        if pd.notna(c_val):
                            c_str = str(c_val).strip()
                            if c_str and c_str.lower() not in ('nan', 'none', ''):
                                device_name = c_str
                                break
                elif "test date" in val_str:
                    for next_c in range(c + 1, df0.shape[1]):
                        c_val = df0.iloc[r, next_c]
                        if pd.notna(c_val):
                            c_str = str(c_val).strip()
                            if c_str and c_str.lower() not in ('nan', 'none', ''):
                                global_test_date = parse_xls_date(c_str)
                                break
                        
    # Find the header row (starting with LotID-waferID)
    header_row_idx = None
    for r in range(df0.shape[0]):
        val = df0.iloc[r, 0]
        if pd.notna(val) and str(val).strip().lower() == "lotid-waferid":
            header_row_idx = r
            break
            
    if header_row_idx is None:
        raise ValueError("Could not find 'LotID-waferID' header row in summary sheet")
        
    # Build column name to index map
    cols = [str(df0.iloc[header_row_idx, c]).strip().lower() for c in range(df0.shape[1])]
    
    created_lots = []
    
    # Iterate wafer rows
    for r in range(header_row_idx + 1, df0.shape[0]):
        cell_val = df0.iloc[r, 0]
        if pd.isna(cell_val):
            continue
            
        wafer_key = str(cell_val).strip()
        # Skip total/average summary rows
        if '-' not in wafer_key or wafer_key.lower() in ('average', 'total', 'total:', 'percentage', 'percentage:'):
            continue
            
        parts = wafer_key.split('-')
        raw_lot = parts[0].strip()
        raw_wafer = parts[1].strip()
        
        lot_id = normalize_lot_id(raw_lot) or raw_lot
        wafer_id = normalize_wafer_id(raw_wafer) or raw_wafer
        
        # Read parameters from current row in df0
        yield_rate = None
        probecard = None
        mp_tester = None
        program = None
        sbin_counts = {}
        
        for c in range(df0.shape[1]):
            col_name = cols[c]
            val = df0.iloc[r, c]
            if pd.isna(val):
                val = None
                
            if col_name == "yield(%)":
                if val is not None:
                    try:
                        # Handle values like 0.9543 vs 95.43
                        val_float = float(str(val).replace('%', '').strip())
                        if val_float > 1.0:
                            val_float /= 100.0
                        yield_rate = round(val_float, 4)
                    except ValueError:
                        pass
            col_clean = col_name.rstrip('.').strip()
            if col_clean in ("probe card no", "probecard", "probe card"):
                probecard = str(val).strip() if val else None
            elif col_clean == "tester":
                mp_tester = str(val).strip() if val else None
            elif col_clean in ("test program", "program"):
                program = str(val).strip() if val else None
            elif col_name.startswith(("sbin", "bin", "s-bin")) or (col_name.startswith("c") and len(col_name) > 1 and col_name[1:].isdigit()):
                try:
                    num_str = ''.join([ch for ch in col_name if ch.isdigit()])
                    if num_str:
                        bin_no = int(num_str)
                        if 1 <= bin_no <= 130:
                            sbin_counts[bin_no] = int(round(float(val))) if val is not None else 0
                except (ValueError, TypeError):
                    pass
                    
        # Now read details from the per-wafer sheet named after raw_wafer or wafer_key
        target_sheet = None
        for sname in xl.sheet_names:
            if sname in (raw_wafer, wafer_id, wafer_key):
                target_sheet = sname
                break
                
        test_start_time = None
        test_finish_time = None
        total_tested = None
        pass_count = None
        
        if target_sheet:
            df_w = xl.parse(target_sheet, header=None)
            
            # Map key-values in first few rows
            for wr in range(min(15, df_w.shape[0])):
                for wc in range(df_w.shape[1] - 1):
                    k_val = df_w.iloc[wr, wc]
                    if pd.notna(k_val):
                        k_str = str(k_val).strip().lower()
                        v_val = df_w.iloc[wr, wc + 1]
                        
                        if "start time" in k_str:
                            test_start_time = parse_xls_date(v_val)
                        elif "finish time" in k_str or "end time" in k_str:
                            test_finish_time = parse_xls_date(v_val)
                        elif k_str in ("total tested", "total dice", "gross dice"):
                            try:
                                total_tested = int(v_val)
                            except (ValueError, TypeError):
                                pass
                        elif k_str in ("pass dice", "pass count", "pass"):
                            try:
                                pass_count = int(v_val)
                            except (ValueError, TypeError):
                                pass
                                
            # If sbin_counts empty, parse sbin from df_w
            if not sbin_counts:
                # Look for SBIN or Category rows (e.g. '1 CP1_PASS', 'sbin1')
                for wr in range(df_w.shape[0]):
                    k_val = df_w.iloc[wr, 0]
                    if pd.notna(k_val):
                        k_str = str(k_val).strip().lower()
                        if k_str.startswith(("sbin", "bin", "s-bin")):
                            try:
                                num_str = ''.join([ch for ch in k_str if ch.isdigit()])
                                if num_str:
                                    bin_no = int(num_str)
                                    if 1 <= bin_no <= 130:
                                        sbin_counts[bin_no] = int(round(float(df_w.iloc[wr, 1]))) if pd.notna(df_w.iloc[wr, 1]) else 0
                            except (ValueError, TypeError):
                                pass
                        else:
                            # Match rows like '1 CP1_PASS', '5 CP1_OPEN'
                            m = re.match(r"^(\d+)\s+.*", k_str)
                            if m:
                                try:
                                    bin_no = int(m.group(1))
                                    if 1 <= bin_no <= 130:
                                        v = df_w.iloc[wr, 1]
                                        if pd.notna(v):
                                            sbin_counts[bin_no] = int(round(float(v)))
                                except (ValueError, TypeError):
                                    pass

        # Default pass_count from sbin1
        if pass_count is None:
            pass_count = sbin_counts.get(1, 0)
        if total_tested is None:
            total_tested = sum(sbin_counts.values()) if sbin_counts else (pass_count if pass_count else 0)
            
        # Default test time fallback to global test date
        if test_finish_time is None:
            test_finish_time = global_test_date
            
        if yield_rate is None and total_tested and total_tested > 0:
            yield_rate = round(pass_count / total_tested, 4)
            
        # Check if lot with same lot_id, wafer_id and type already exists
        existing_lot = db.query(Lot).filter(
            Lot.lot_id == lot_id,
            Lot.wafer_id == wafer_id,
            Lot.data_type == 'MP_Yield'
        ).first()

        saved_storage_path = filepath
        if existing_lot and existing_lot.storage_path and not existing_lot.storage_path.startswith('/tmp'):
            saved_storage_path = existing_lot.storage_path
        elif filepath.startswith('/tmp'):
            zip_candidate = f"/app/uploads/Summary/{filename}.zip"
            if os.path.exists(zip_candidate):
                saved_storage_path = zip_candidate
        
        if existing_lot:
            # Overwrite: delete existing lot and its bin summary
            for bs in db.query(BinSummary).filter(BinSummary.lot_id == existing_lot.id).all():
                db.delete(bs)
            db.delete(existing_lot)
            db.commit()
            
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
            
            product_name=device_name,
            lot_id=lot_id,
            wafer_id=wafer_id,
            data_type='MP_Yield',
            test_stage='MP_Yield',
            test_machine=mp_tester,
            mp_tester=mp_tester,
            probecard=probecard,
            program=program,
            die_count=total_tested,
            pass_count=pass_count,
            yield_rate=yield_rate,
            osat_name=osat_name,
            test_date=test_finish_time,
            beginning_time=test_start_time,
            ending_time=test_finish_time,
        )
        
        db.add(lot)
        db.flush()
        
        # Save BinSummary records (1 to 130)
        for sbin_idx in range(1, 131):
            count = sbin_counts.get(sbin_idx, 0)
            percentage = (count / total_tested) * 100.0 if (total_tested and total_tested > 0) else 0.0
            
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
        
    return created_lots
