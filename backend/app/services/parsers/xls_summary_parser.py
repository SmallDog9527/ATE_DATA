import os
import openpyxl
from sqlalchemy.orm import Session

def parse_and_save_xls_summary(filepath: str, db: Session, user_id: int = None, osat_name: str = "Chipmore") -> list:
    """
    Unified entry point for parsing XLS/XLSX summary reports.
    Dispatches parsing requests to the correct OSAT parser based on the factory name,
    with auto-detection support for KSHT and LBS formats.
    """
    sheet_names = []
    is_xls = filepath.lower().endswith('.xls')
    
    # 1. Determine sheet names using openpyxl (for xlsx) or xlrd (for xls)
    try:
        if is_xls:
            import xlrd
            wb = xlrd.open_workbook(filepath, on_demand=True)
            sheet_names = wb.sheet_names()
        else:
            wb = openpyxl.load_workbook(filepath, read_only=True)
            sheet_names = wb.sheetnames
            wb.close()
    except Exception as e:
        print(f"[xls_summary_parser] Error reading sheet names for auto-detection: {e}")

    # 1.5 Auto-detection check for "VENDOR" -> "CHIPMORE" in the first sheet
    is_vendor_chipmore = False
    try:
        if is_xls:
            import xlrd
            wb = xlrd.open_workbook(filepath)
            sh = wb.sheet_by_index(0)
            for r in range(min(15, sh.nrows)):
                for c in range(sh.ncols):
                    val = str(sh.cell_value(r, c)).strip().upper()
                    if val == "VENDOR":
                        for offset in (1, 2):
                            if c + offset < sh.ncols:
                                next_val = str(sh.cell_value(r, c + offset)).strip().upper()
                                if next_val == "CHIPMORE":
                                    is_vendor_chipmore = True
                                    break
                if is_vendor_chipmore:
                    break
        else:
            wb = openpyxl.load_workbook(filepath, data_only=True)
            sh = wb.worksheets[0]
            max_r = min(15, sh.max_row or 15)
            max_c = min(30, sh.max_column or 30)
            for r in range(1, max_r + 1):
                for c in range(1, max_c + 1):
                    val = sh.cell(r, c).value
                    if val and str(val).strip().upper() == "VENDOR":
                        for offset in (1, 2):
                            if c + offset <= sh.max_column:
                                next_val = sh.cell(r, c + offset).value
                                if next_val and str(next_val).strip().upper() == "CHIPMORE":
                                    is_vendor_chipmore = True
                                    break
                if is_vendor_chipmore:
                    break
            wb.close()
    except Exception as e:
        print(f"[xls_summary_parser] Error checking VENDOR/CHIPMORE: {e}")

    # 2. Determine parser name based on auto-detection or fallback to osat_name
    name = str(osat_name).strip().lower()
    
    if is_vendor_chipmore:
        print("[xls_summary_parser] Auto-detected Chipmore Format (has VENDOR: CHIPMORE)")
        name = "Chipmore"
    elif "Bin_Summary" in sheet_names:
        print("[xls_summary_parser] Auto-detected LBS Format (has 'Bin_Summary' sheet)")
        name = "lbs"
    elif "Lot" in sheet_names:
        print("[xls_summary_parser] Auto-detected KSHT Format 1 (has 'Lot' sheet)")
        name = "ksht"
    elif "Summary" in sheet_names:
        is_ksht_format2 = False
        try:
            if is_xls:
                import xlrd
                wb = xlrd.open_workbook(filepath)
                sh = wb.sheet_by_name("Summary")
                for r in range(min(10, sh.nrows)):
                    row_vals = [str(sh.cell_value(r, c)).strip().lower() for c in range(sh.ncols)]
                    if any("test start time" in val for val in row_vals):
                        is_ksht_format2 = True
                        break
            else:
                wb = openpyxl.load_workbook(filepath, read_only=True)
                sh = wb["Summary"]
                for row in sh.iter_rows(max_row=10, values_only=True):
                    if any(x is not None for x in row):
                        row_vals = [str(x).strip().lower() for x in row if x is not None]
                        if any("test start time" in val for val in row_vals):
                            is_ksht_format2 = True
                            break
                wb.close()
        except Exception as e:
            print(f"[xls_summary_parser] Error checking KSHT format 2 headers: {e}")
        
        if is_ksht_format2:
            print("[xls_summary_parser] Auto-detected KSHT Format 2 (has 'Test Start Time' header)")
            name = "ksht"

    # Fallback to filename-based detection if sheet detection didn't resolve it
    if name not in ("lbs", "ksht", "chipmore", "Chipmore"):
        filename_lower = os.path.basename(filepath).lower()
        if "lbs" in filename_lower:
            print("[xls_summary_parser] Auto-detected LBS via filename")
            name = "lbs"
        elif "ksht" in filename_lower:
            print("[xls_summary_parser] Auto-detected KSHT via filename")
            name = "ksht"

    print(f"[xls_summary_parser] Routing summary report parse for OSAT: {name!r} (original: {osat_name!r})")
    
    if name == "ksht":
        from app.services.parsers.ksht_summary_parser import parse_and_save_ksht_summary
        # Pass name as the active osat_name (KSHT) so it saves it as "KSHT" OSAT
        return parse_and_save_ksht_summary(filepath, db, user_id, osat_name="KSHT")
    elif name == "lbs":
        from app.services.parsers.lbs_summary_parser import parse_and_save_lbs_summary
        return parse_and_save_lbs_summary(filepath, db, user_id, osat_name="LBS")
    elif name in ("chipmore", "Chipmore") or not name:
        from app.services.parsers.chipmore_summary_parser import parse_and_save_chipmore_summary
        return parse_and_save_chipmore_summary(filepath, db, user_id, osat_name="Chipmore")
    else:
        print(f"[xls_summary_parser] Warning: Unknown OSAT {osat_name!r}. Falling back to Chipmore parser.")
        from app.services.parsers.chipmore_summary_parser import parse_and_save_chipmore_summary
        fallback_osat_name = "Chipmore" if str(osat_name).strip().lower() == "chipmore" else osat_name
        return parse_and_save_chipmore_summary(filepath, db, user_id, fallback_osat_name)
