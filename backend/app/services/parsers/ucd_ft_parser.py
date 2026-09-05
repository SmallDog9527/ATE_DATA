import os
import pandas as pd
from datetime import datetime
from sqlalchemy.orm import Session
from app.models.lot import Lot, DataSource, ProcessStatus
from app.models.bin_summary import BinSummary
from app.models.osat_device_mapping import OsatDeviceMapping

def parse_and_save_ucd_ft(filepath: str, db: Session, user_id: int = None, osat_name: str = "UCD") -> list:
    """
    Parse UCD FT Summary reports and save the parsed data into the database.
    """
    filename = os.path.basename(filepath)
    print(f"[ucd_ft_parser] Parsing file: {filename}")
    
    # Read the 'FT' sheet. Header starts where we find 'Stage' or similar. 
    # Usually around row 16-18. We can read all and find the header.
    df_full = pd.read_excel(filepath, sheet_name='FT', header=None)
    header_idx = -1
    for idx, row in df_full.iterrows():
        if row.astype(str).str.contains('Stage', case=False, na=False).any():
            header_idx = idx
            break
            
    if header_idx == -1:
        print("[ucd_ft_parser] Could not find header row with 'Stage'")
        return []
        
    df = pd.read_excel(filepath, sheet_name='FT', header=header_idx)
    
    # Pre-fetch OSAT mappings
    mappings = {m.osat_product_name: m.internal_product_name for m in db.query(OsatDeviceMapping).all()}
    
    created_lots = []
    
    # Find column names dynamically if possible
    # In UCD FT, columns: Product, Package, Program, Customer Lot, Wafer, Stage, Total, Pass, Yield, Bin1...
    # We will try to map by name heuristics
    def find_col(kw):
        for c in df.columns:
            if kw.lower() in str(c).lower():
                return c
        return None
        
    col_product = find_col('product') or df.columns[3]
    col_package = find_col('package') or df.columns[4]
    col_program = find_col('program') or df.columns[5]
    col_cust_lot = find_col('customer lot') or find_col('lot') or df.columns[6]
    col_stage = find_col('stage') or df.columns[9]
    col_total = find_col('total') or df.columns[10]
    col_pass = find_col('pass') or df.columns[11]
    col_yield = find_col('yield') or df.columns[12]
    col_tester = find_col('tester')
    col_handler = find_col('handler')
    col_date = find_col('date')
    
    for idx, row in df.iterrows():
        cust = row.iloc[2] # HMC
        if pd.isna(cust) or str(cust).strip().upper() != 'HMC':
            continue
            
        stage = str(row[col_stage]).strip() if pd.notna(row[col_stage]) else None
        if not stage:
            continue
            
        wafer_id = str(row.iloc[7]).strip() if pd.notna(row.iloc[7]) else None # Usually Wafer is at col 7
        if wafer_id and "#" in str(row[col_cust_lot]):
            lot_id = str(row[col_cust_lot]).split('#')[0].strip()
        else:
            lot_id = str(row[col_cust_lot]).strip()
            
        osat_product = str(row[col_product]).strip() if pd.notna(row[col_product]) else ""
        internal_product = mappings.get(osat_product, osat_product)
        
        program = str(row[col_program]).strip() if pd.notna(row[col_program]) else None
        package = str(row[col_package]).strip() if pd.notna(row[col_package]) else None
        tester = str(row[col_tester]).strip() if col_tester and pd.notna(row[col_tester]) else None
        handler = str(row[col_handler]).strip() if col_handler and pd.notna(row[col_handler]) else None
        
        total = int(float(row[col_total])) if pd.notna(row[col_total]) else 0
        pass_count = int(float(row[col_pass])) if pd.notna(row[col_pass]) else 0
        
        yield_rate = None
        if pd.notna(row[col_yield]):
            try:
                val_str = str(row[col_yield]).replace('%', '').strip()
                val = float(val_str)
                if val > 1.0:
                    yield_rate = val / 100.0
                else:
                    yield_rate = val
            except ValueError:
                pass
                
        test_date = None
        if col_date and pd.notna(row[col_date]):
            try:
                test_date = pd.to_datetime(row[col_date])
            except:
                pass
                
        # Check existing to avoid duplicate
        existing = db.query(Lot).filter(
            Lot.data_type == 'FT_Yield',
            Lot.lot_id == lot_id,
            Lot.wafer_id == wafer_id,
            Lot.temperature == stage
        ).first()
        
        if existing:
            continue

        lot = Lot(
            filename=filename,
            storage_path=filepath,
            file_size=os.path.getsize(filepath),
            status=ProcessStatus.processed,
            data_source=DataSource.manual if user_id else DataSource.ftp,
            storage_type='local',
            upload_date=datetime.now(),
            user_id=user_id,
            
            product_name=internal_product,
            osat_product_name=osat_product,
            lot_id=lot_id,
            wafer_id=wafer_id,
            package=package,
            data_type='FT_Yield',
            test_stage='FT_Yield',
            temperature=stage,
            mp_tester=tester,
            handler=handler,
            program=program,
            die_count=total,
            pass_count=pass_count,
            yield_rate=yield_rate,
            osat_name=osat_name,
            test_date=test_date,
            beginning_time=test_date,
            ending_time=test_date,
        )
        db.add(lot)
        db.flush()
        
        # Bin loop: find Bin columns
        for c in df.columns:
            c_str = str(c)
            if 'BIN' in c_str.upper() and not c_str.upper().startswith('H'):
                b_num_str = ''.join(filter(str.isdigit, c_str))
                if b_num_str:
                    b_num = int(b_num_str)
                    count = int(float(row[c])) if pd.notna(row[c]) else 0
                    if count > 0:
                        percentage = (count / total) * 100.0 if total > 0 else 0.0
                        bin_sum = BinSummary(
                            lot_id=lot.id,
                            bin_number=b_num,
                            bin_name=f"Sbin{b_num}",
                            site=0,
                            count=count,
                            percentage=percentage,
                            data_range="final"
                        )
                        db.add(bin_sum)
                        
        created_lots.append(lot)
        
    db.commit()
    print(f"[ucd_ft_parser] Finished parsing UCD FT. Total new lots added: {len(created_lots)}")
    return created_lots
