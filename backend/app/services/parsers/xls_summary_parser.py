import os
import openpyxl
from sqlalchemy.orm import Session

def parse_and_save_xls_summary(filepath: str, db: Session, user_id: int = None, osat_name: str = "chipmore") -> list:
    """
    Unified entry point for parsing XLS/XLSX summary reports.
    Dispatches parsing requests to the correct OSAT parser based on the factory name,
    with auto-detection support for KSHT format.
    """
    name = str(osat_name).strip().lower()
    
    # Auto-detect KSHT format
    try:
        wb = openpyxl.load_workbook(filepath, read_only=True)
        sheet_names = wb.sheetnames
        if "Lot" in sheet_names:
            print("[xls_summary_parser] Auto-detected KSHT Format 1 (has 'Lot' sheet)")
            name = "ksht"
        elif "Summary" in sheet_names:
            sh = wb["Summary"]
            # Find first non-empty row to check headers
            first_row_vals = []
            for row in sh.iter_rows(max_row=10, values_only=True):
                if any(x is not None for x in row):
                    first_row_vals = [str(x).strip().lower() for x in row if x is not None]
                    break
            if any("test start time" in val for val in first_row_vals):
                print("[xls_summary_parser] Auto-detected KSHT Format 2 (has 'Test Start Time' header)")
                name = "ksht"
        wb.close()
    except Exception as e:
        print(f"[xls_summary_parser] Error during format auto-detection: {e}")

    print(f"[xls_summary_parser] Routing summary report parse for OSAT: {name!r} (original: {osat_name!r})")
    
    if name == "ksht":
        from app.services.parsers.ksht_summary_parser import parse_and_save_ksht_summary
        # Pass name as the active osat_name (KSHT) so it saves it as "KSHT" OSAT
        return parse_and_save_ksht_summary(filepath, db, user_id, osat_name="KSHT")
    elif name == "lbs":
        from app.services.parsers.lbs_summary_parser import parse_and_save_lbs_summary
        return parse_and_save_lbs_summary(filepath, db, user_id, osat_name)
    elif name == "chipmore" or not name:
        from app.services.parsers.chipmore_summary_parser import parse_and_save_chipmore_summary
        return parse_and_save_chipmore_summary(filepath, db, user_id, osat_name)
    else:
        print(f"[xls_summary_parser] Warning: Unknown OSAT {osat_name!r}. Falling back to Chipmore parser.")
        from app.services.parsers.chipmore_summary_parser import parse_and_save_chipmore_summary
        return parse_and_save_chipmore_summary(filepath, db, user_id, osat_name)
