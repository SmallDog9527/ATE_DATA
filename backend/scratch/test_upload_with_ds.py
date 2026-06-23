import os
import sys
import asyncio

# Add app directory to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from fastapi import UploadFile
from app.core.database import SessionLocal
from app.models.user import User
from app.api.routes.programs import upload_pgs

async def run_test():
    db = SessionLocal()
    try:
        admin_user = db.query(User).filter(User.role == "admin").first()
        if not admin_user:
            print("No admin user found in database!")
            return
            
        program_path = "/app/uploads/pgs_files/HL5083ACP00_204KM_A00_V10.zip"
        datasheet_path = "/app/scratch/HL5083A_DATASHEET_REV1.0.docx"
        
        print(f"Program exists: {os.path.exists(program_path)}")
        print(f"Datasheet exists: {os.path.exists(datasheet_path)}")
        
        # Open and wrap files in UploadFile
        p_file = open(program_path, "rb")
        d_file = open(datasheet_path, "rb")
        
        p_upload = UploadFile(file=p_file, filename=os.path.basename(program_path))
        d_upload = UploadFile(file=d_file, filename=os.path.basename(datasheet_path))
        
        print("Calling upload_pgs directly...")
        # Since upload_pgs is an async function, we await it
        result = await upload_pgs(
            file=p_upload,
            product_name="HL5083A",
            tester="T2K",
            datasheet_file=d_upload,
            db=db,
            current_user=admin_user
        )
        print("Direct call success!")
        print(f"Result: {result}")
        
        # Clean up files
        p_file.close()
        d_file.close()
        
    except Exception as e:
        print(f"Exception: {e}")
        import traceback
        traceback.print_exc()
    finally:
        db.close()

if __name__ == "__main__":
    asyncio.run(run_test())
