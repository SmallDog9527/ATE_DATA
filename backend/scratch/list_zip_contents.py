import os
import sys
import zipfile

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from app.core.config import settings

def main():
    base_name = "HL5083ACP00_204KM_A00_V10"
    zip_path = os.path.join(settings.UPLOAD_DIR, "pgs_files", base_name + ".zip")
    if not os.path.exists(zip_path):
        print(f"File not found: {zip_path}")
        return
        
    print(f"Listing files in zip: {zip_path}")
    with zipfile.ZipFile(zip_path, 'r') as zf:
        for info in zf.infolist()[:50]:
            print(f"  {info.filename} ({info.file_size} bytes)")
        if len(zf.infolist()) > 50:
            print(f"  ... and {len(zf.infolist()) - 50} more files")

if __name__ == "__main__":
    main()
