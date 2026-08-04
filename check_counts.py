import sys
from app.db.session import SessionLocal
from app.models.osat_config import OsatConfig
from app.models.ftp_upload_log import FtpUploadLog
from app.models.lot import Lot
from sqlalchemy import func

db = SessionLocal()

chipmore = db.query(OsatConfig).filter(OsatConfig.name.ilike('%chipmore%')).first()
print('Chipmore OSAT:', chipmore.id if chipmore else None, chipmore.name if chipmore else None)

if chipmore:
    osat_id = chipmore.id

    logs_success = db.query(FtpUploadLog).filter(FtpUploadLog.osat_id == osat_id, FtpUploadLog.status == 'success').all()
    print('Total success FtpUploadLogs:', len(logs_success))

    def is_summary_file(fname):
        if not fname: return False
        nl = fname.lower()
        if nl.endswith(('.xls', '.xlsx')): return True
        if nl.endswith('.txt') and ('ets' in nl or 'summary' in nl): return True
        return False

    summary_logs = [l for l in logs_success if is_summary_file(l.filename or (l.remote_path.split('/')[-1] if l.remote_path else ''))]
    data_logs = [l for l in logs_success if not is_summary_file(l.filename or (l.remote_path.split('/')[-1] if l.remote_path else ''))]
    print('  Summary logs count (summary_pass):', len(summary_logs))
    print('  Data logs count (data_pass):', len(data_logs))

    exts = {}
    for l in data_logs:
        fn = (l.filename or (l.remote_path.split('/')[-1] if l.remote_path else '')).lower()
        ext = fn.split('.')[-1] if '.' in fn else 'no_ext'
        exts[ext] = exts.get(ext, 0) + 1
    print('  Data logs extensions breakdown:', exts)

    lots = db.query(Lot).filter(Lot.osat_id == osat_id).all()
    print('\nTotal Lots in Lot table for Chipmore:', len(lots))

    lot_sources = {}
    for lot in lots:
        s = lot.data_source or 'unknown'
        lot_sources[s] = lot_sources.get(s, 0) + 1
    print('  Lot table data_source breakdown:', lot_sources)

    data_types = {}
    for lot in lots:
        dt = str(lot.data_type)
        data_types[dt] = data_types.get(dt, 0) + 1
    print('  Lot table data_type breakdown:', data_types)

