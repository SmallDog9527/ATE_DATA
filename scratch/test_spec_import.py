import os
import sys

# Add app directory to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.core.database import SessionLocal
from app.services.spec_service import import_checklist_specs, import_docx_datasheet

def main():
    db = SessionLocal()
    try:
        product_name = "HL5083A"
        
        # Test Excel Checklist import
        checklist_path = "scratch/HL5083A_ATE_Coverage_Checklist.xlsx"
        print(f"Testing checklist import from: {checklist_path}...")
        res_checklist = import_checklist_specs(db, checklist_path, product_name)
        print("Checklist import success!")
        print(f"Details: {res_checklist}")
        
        # Test Docx Datasheet import
        datasheet_path = "scratch/HL5083A_DATASHEET_REV1.0.docx"
        print(f"Testing datasheet import from: {datasheet_path}...")
        res_datasheet = import_docx_datasheet(db, datasheet_path, product_name)
        print("Datasheet import success!")
        print(f"Details: {res_datasheet}")
        
    except Exception as e:
        print(f"Error occurred during test: {e}")
        import traceback
        traceback.print_exc()
    finally:
        db.close()

if __name__ == "__main__":
    main()
