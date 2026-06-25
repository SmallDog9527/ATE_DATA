import os
import pandas as pd
from datetime import datetime
from sqlalchemy.orm import Session
from app.models.lot import Lot, DataSource, ProcessStatus
from app.models.bin_summary import BinSummary

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
                if val_str == "device name":
                    if c + 1 < df0.shape[1]:
                        device_name = str(df0.iloc[r, c + 1]).strip()
                elif val_str == "test date":
                    if c + 1 < df0.shape[1]:
                        global_test_date = parse_xls_date(df0.iloc[r, c + 1])
                        
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
        lot_id = parts[0].strip()
        wafer_id = parts[1].strip()
        
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
            elif col_name in ("probe card no", "probecard"):
                probecard = str(val).strip() if val else None
            elif col_name == "tester":
                mp_tester = str(val).strip() if val else None
            elif col_name == "test program":
                program = str(val).strip() if val else None
            elif col_name.startswith('c') and col_name[1:].isdigit():
                c_num = int(col_name[1:])
                if 1 <= c_num <= 130:
                    sbin_counts[c_num] = int(val) if val is not None else 0
                    
        # Read details from individual wafer sheet
        total_tested = None
        test_finish_time = None
        test_start_time = None
        pass_count = None
        
        if wafer_key in xl.sheet_names:
            df_wafer = xl.parse(wafer_key, header=None)
            for wr in range(df_wafer.shape[0]):
                for wc in range(df_wafer.shape[1]):
                    wval = df_wafer.iloc[wr, wc]
                    if pd.notna(wval):
                        wval_str = str(wval).strip().lower()
                        if wval_str == "total tested":
                            if wc + 1 < df_wafer.shape[1]:
                                raw_tot = df_wafer.iloc[wr, wc + 1]
                                try:
                                    total_tested = int(float(str(raw_tot).strip()))
                                except ValueError:
                                    pass
                        elif wval_str == "test finish time":
                            if wc + 1 < df_wafer.shape[1]:
                                raw_time = df_wafer.iloc[wr, wc + 1]
                                test_finish_time = parse_xls_date(raw_time)
                        elif wval_str == "test start time":
                            if wc + 1 < df_wafer.shape[1]:
                                raw_start = df_wafer.iloc[wr, wc + 1]
                                test_start_time = parse_xls_date(raw_start)
                        elif wval_str == "pass":
                            if wc + 1 < df_wafer.shape[1]:
                                raw_pass = df_wafer.iloc[wr, wc + 1]
                                try:
                                    pass_count = int(float(str(raw_pass).strip()))
                                except ValueError:
                                    pass
                                    
        # Default pass calculation: bin1 + bin2
        if pass_count is None:
            pass_count = sbin_counts.get(1, 0) + sbin_counts.get(2, 0)
            
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
        
        if existing_lot:
            # Overwrite: delete existing lot and its bin summary
            for bs in db.query(BinSummary).filter(BinSummary.lot_id == existing_lot.id).all():
                db.delete(bs)
            db.delete(existing_lot)
            db.commit()
            
        # Create new Lot record
        lot = Lot(
            filename=filename,
            storage_path=filepath,
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
        db.commit()
        db.refresh(lot)
        
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
