import os
from sqlalchemy.orm import Session

def parse_and_save_xls_summary(filepath: str, db: Session, user_id: int = None, osat_name: str = "chipmore") -> list:
    """
    Unified entry point for parsing XLS/XLSX summary reports.
    Dispatches parsing requests to the correct OSAT parser based on the factory name.
    """
    name = str(osat_name).strip().lower()
    print(f"[xls_summary_parser] Routing summary report parse for OSAT: {osat_name!r}")
    
    if name == "chipmore" or not name:
        from app.services.parsers.chipmore_summary_parser import parse_and_save_chipmore_summary
        return parse_and_save_chipmore_summary(filepath, db, user_id, osat_name)
    else:
        # Fallback to Chipmore parser if no other match exists yet,
        # or raise an exception if explicit new formats are introduced.
        print(f"[xls_summary_parser] Warning: Unknown OSAT {osat_name!r}. Falling back to Chipmore parser.")
        from app.services.parsers.chipmore_summary_parser import parse_and_save_chipmore_summary
        return parse_and_save_chipmore_summary(filepath, db, user_id, osat_name)
