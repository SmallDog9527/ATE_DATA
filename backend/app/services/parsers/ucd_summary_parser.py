import os
import pandas as pd
from datetime import datetime
from sqlalchemy.orm import Session
from app.models.lot import Lot, DataSource, ProcessStatus
from app.models.bin_summary import BinSummary

def parse_ucd_date(val):
    if not val:
        return None
    s = str(val).strip().split('.')[0]
    for fmt in ("%Y/%m/%d", "%Y-%m-%d", "%Y/%m/%d %H:%M:%S", "%Y-%m-%d %H:%M:%S"):
        try:
            return datetime.strptime(s, fmt)
        except ValueError:
            pass
    return None

def parse_and_save_ucd_summary(filepath: str, db: Session, user_id: int = None, osat_name: str = "UCD") -> list:
    """
    Parse UCD Excel summary reports (first sheet: Probe by wafer)
    and save the parsed wafer data into the database.
    """
    filename = os.path.basename(filepath)
    print(f"[ucd_summary_parser] Parsing file: {filename}")
    
    # Read the first sheet, header starts at Row 2 (index 2)
    df0 = pd.read_excel(filepath, sheet_name=0, header=2)
    
    created_lots = []
    
    # Cache existing lot/wafer combinations in DB to speed up lookup
    existing_lots = set(
        db.query(Lot.lot_id, Lot.wafer_id)
        .filter(Lot.data_type == 'MP_Yield')
        .all()
    )
    print(f"[ucd_summary_parser] Found {len(existing_lots)} existing lots in DB")
    
    batch_count = 0
    for idx, row in df0.iterrows():
        cust = row.get('Cust')
        if pd.isna(cust) or str(cust).strip().upper() != 'HMC':
            continue
            
        wafer = row.get('Wafer')
        ww = row.get('WW')
        if pd.isna(wafer) or pd.isna(ww):
            continue
            
        # Split by '#' to merge split-lots (e.g. 139A53#A & 139A53#B -> 139A53)
        lot_id = str(wafer).strip().split('#')[0]
        wafer_id = f"{int(float(ww)):02d}"
        
        # Check if already processed (incremental update)
        if (lot_id, wafer_id) in existing_lots:
            continue
            
        product_name = str(row.get('Device')).strip() if pd.notna(row.get('Device')) else ""
        program = str(row.get('Program')).strip() if pd.notna(row.get('Program')) else None
        mp_tester = str(row.get('Tester')).strip() if pd.notna(row.get('Tester')) else None
        handler = str(row.get('Handeler')).strip() if pd.notna(row.get('Handeler')) else None
        
        die_count = int(float(row.get('TestIn'))) if pd.notna(row.get('TestIn')) else 0
        pass_count = int(float(row.get('TestOut'))) if pd.notna(row.get('TestOut')) else 0
        
        yield_rate = None
        if pd.notna(row.get('Yield')):
            try:
                yield_rate = float(row.get('Yield'))
            except ValueError:
                pass
                
        test_date = parse_ucd_date(row.get('Test_Date'))
        
        # Extract bin counts (Bin1 to Bin64)
        sbin_counts = {}
        for i in range(1, 65):
            bin_col = f"Bin{i}"
            if bin_col in row and pd.notna(row[bin_col]):
                sbin_counts[i] = int(float(row[bin_col]))
            else:
                sbin_counts[i] = 0
                
        # Create Lot
        lot = Lot(
            filename=filename,
            storage_path=filepath,
            file_size=os.path.getsize(filepath),
            status=ProcessStatus.processed,
            data_source=DataSource.manual if user_id else DataSource.ftp,
            storage_type='local',
            upload_date=datetime.now(),
            user_id=user_id,
            
            product_name=product_name,
            lot_id=lot_id,
            wafer_id=wafer_id,
            data_type='MP_Yield',
            test_stage='MP_Yield',
            test_machine=mp_tester,
            mp_tester=mp_tester,
            probecard=None,
            program=program,
            handler=handler,
            die_count=die_count,
            pass_count=pass_count,
            yield_rate=yield_rate,
            osat_name=osat_name,
            test_date=test_date,
            beginning_time=test_date,
            ending_time=test_date,
        )
        db.add(lot)
        db.flush() # Flush to get lot.id
        
        # Save BinSummary records
        for b_num, count in sbin_counts.items():
            percentage = (count / die_count) * 100.0 if (die_count and die_count > 0) else 0.0
            bin_name = f"Sbin{b_num}"
                
            bin_sum = BinSummary(
                lot_id=lot.id,
                bin_number=b_num,
                bin_name=bin_name,
                site=0,
                count=count,
                percentage=percentage,
                data_range="final"
            )
            db.add(bin_sum)
            
        created_lots.append(lot)
        batch_count += 1
        
        # Commit every 500 lots to optimize performance
        if batch_count % 500 == 0:
            db.commit()
            print(f"[ucd_summary_parser] Committed batch of 500 lots (total processed: {batch_count})")
            
    # Final commit
    db.commit()
    print(f"[ucd_summary_parser] Finished parsing UCD Summary. Total new lots added: {len(created_lots)}")
    return created_lots
