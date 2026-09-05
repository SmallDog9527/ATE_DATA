import os
import pandas as pd
from datetime import datetime
from sqlalchemy.orm import Session
from app.models.lot import Lot, DataSource, ProcessStatus
from app.models.bin_summary import BinSummary
from app.models.osat_device_mapping import OsatDeviceMapping

def parse_and_save_cmc_ft(filepath: str, db: Session, user_id: int = None, osat_name: str = "CMC") -> list:
    """
    Parse CMC FT Summary reports (HL... files) and save the parsed data into the database.
    """
    filename = os.path.basename(filepath)
    print(f"[cmc_ft_parser] Parsing file: {filename}")
    
    df = pd.read_excel(filepath)
    
    mappings = {m.osat_product_name: m.internal_product_name for m in db.query(OsatDeviceMapping).all()}
    
    created_lots = []
    
    for idx, row in df.iterrows():
        lot_id = str(row.get('流水号', '')).strip()
        if not lot_id or lot_id == 'nan':
            continue
            
        temperature = str(row.get('温度', '')).strip()
        wafer_id = str(row.get('客户扩散批', '')).strip()
        package = str(row.get('封装形式', '')).strip()
        osat_product = str(row.get('产品名', '')).strip()
        internal_product = mappings.get(osat_product, osat_product)
        program = str(row.get('测试程序名', '')).strip()
        tester = str(row.get('测试系统号', '')).strip()
        
        total = int(float(row.get('总数实际', 0))) if pd.notna(row.get('总数实际')) else 0
        pass_count = int(float(row.get('良品实际', 0))) if pd.notna(row.get('良品实际')) else 0
        
        yield_rate = None
        if pd.notna(row.get('良率')):
            try:
                val = float(row.get('良率'))
                if val > 1.0:
                    yield_rate = val / 100.0
                else:
                    yield_rate = val
            except ValueError:
                pass
                
        test_date = None
        date_col = '结批日期' if '结批日期' in row else '日期'
        if date_col in row and pd.notna(row[date_col]):
            try:
                test_date = pd.to_datetime(row[date_col])
            except:
                pass
                
        # Check existing
        existing = db.query(Lot).filter(
            Lot.data_type == 'FT_Yield',
            Lot.lot_id == lot_id,
            Lot.wafer_id == wafer_id,
            Lot.osat_name == 'CMC',
            Lot.temperature == temperature
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
            temperature=temperature,
            mp_tester=tester,
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
        
        # Bins: HBIN1 to HBINx are soft bins in this format?
        # Usually HBIN means Hard Bin, but let's save them as Sbin since the UI expects Sbin.
        special_bins = {
            '外次': 128,
            '丢失': 129,
            '工程': 130
        }
        
        for c in df.columns:
            c_str = str(c).strip().upper()
            b_num = None
            
            if 'BIN' in c_str:
                b_num_str = ''.join(filter(str.isdigit, c_str))
                if b_num_str:
                    b_num = int(b_num_str)
            elif c_str in special_bins:
                b_num = special_bins[c_str]
            elif str(c).strip() in special_bins:
                b_num = special_bins[str(c).strip()]
                
            if b_num is not None and 1 <= b_num <= 130:
                count = int(float(row[c])) if pd.notna(row[c]) else 0
                if count > 0:
                    setattr(lot, f"sbin{b_num}", count)
                    percentage = (count / total) * 100.0 if total > 0 else 0.0
                    b_name = str(c).strip() if b_num in [128, 129, 130] else f"Sbin{b_num}"
                    bin_sum = BinSummary(
                        lot_id=lot.id,
                        bin_number=b_num,
                        bin_name=b_name,
                        site=0,
                        count=count,
                        percentage=percentage,
                        data_range="final"
                    )
                    db.add(bin_sum)
                        
        created_lots.append(lot)
        
    db.commit()
    print(f"[cmc_ft_parser] Finished parsing CMC FT. Total new lots added: {len(created_lots)}")
    return created_lots
