import os
import sys
import json
import shutil

# Add backend dir to python path
import sys
import os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../backend')))

os.environ["DATABASE_URL"] = "postgresql://admin:3344520Qq@localhost:5432/chip_data"
os.environ["REDIS_URL"] = "redis://localhost:6379"
os.environ["SECRET_KEY"] = "chip-ate-analysis-system-secret-key-2026"
os.environ["UPLOAD_DIR"] = os.path.abspath(os.path.join(os.path.dirname(__file__), '../backend/uploads'))

from app.core.database import SessionLocal
from app.models.pgs_upload import PgsUpload
from app.core.config import settings
from app.services.parsers.t2k_parser import parse_t2k_folder

def upload_t2k(folder_path: str):
    print(f"Parsing T2K folder: {folder_path}")
    result = parse_t2k_folder(folder_path)
    
    params = result['params']
    summary = result['summary']
    
    print(f"Parsed {len(params)} parameters and {len(summary)} bins.")
    
    db = SessionLocal()
    try:
        # Create PgsUpload record
        filename = os.path.basename(os.path.normpath(folder_path))
        product_name = filename.split('_')[0] if '_' in filename else filename
        program_version = filename

        # Check if already exists
        existing = db.query(PgsUpload).filter(PgsUpload.filename == filename).first()
        if existing:
            print(f"Updating existing upload for {filename}")
            existing.parsed_params = json.dumps(params)
            existing.parsed_summary = json.dumps(summary)
            existing.program_version = program_version
            existing.product_name = product_name
            existing.parse_status = "ok"
            upload = existing
        else:
            print(f"Creating new upload for {filename}")
            upload = PgsUpload(
                filename=filename,
                product_name=product_name,
                program_version=program_version,
                parse_status="ok",
                parsed_params=json.dumps(params),
                parsed_summary=json.dumps(summary)
            )
            db.add(upload)
            
        db.commit()
        db.refresh(upload)
        
        print(f"Successfully uploaded. Upload ID: {upload.id}")
        
        # Setup CPP cache
        upload_dir = os.path.expanduser(settings.UPLOAD_DIR)
        cache_dir = os.path.join(upload_dir, f"extracted_program_{filename}")
        source_dir = os.path.join(cache_dir, "source")
        
        os.makedirs(source_dir, exist_ok=True)
        
        cpp_source_path = os.path.join(folder_path, "TestClasses", "TPG", "TPG.cpp")
        cpp_dest_path = os.path.join(source_dir, "test.cpp")
        
        if os.path.exists(cpp_source_path):
            shutil.copy2(cpp_source_path, cpp_dest_path)
            print(f"Copied TPG.cpp to {cpp_dest_path}")
        else:
            print(f"Warning: Could not find {cpp_source_path}")
            
    finally:
        db.close()

if __name__ == "__main__":
    folder = r"D:\ATE_DATA\Temp\HL5501WL01_102_V03_T32\HL5501WL01_102_V03_T32"
    upload_t2k(folder)
