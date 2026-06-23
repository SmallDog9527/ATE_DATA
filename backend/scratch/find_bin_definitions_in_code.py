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
        
    print(f"Searching for bin names in zip: {zip_path}")
    
    # We will look for files in the zip and search their contents
    with zipfile.ZipFile(zip_path, 'r') as zf:
        for name in zf.namelist():
            if name.endswith(('.cpp', '.h', '.txt')):
                try:
                    content = zf.read(name).decode('utf-8', errors='ignore')
                    if "OS_OPEN" in content:
                        print(f"  Found 'OS_OPEN' in {name}:")
                        # print first 5 matching lines
                        lines = content.splitlines()
                        for i, line in enumerate(lines):
                            if "OS_OPEN" in line:
                                print(f"    Line {i+1}: {line.strip()}")
                except Exception as e:
                    print(f"  Error reading {name}: {e}")

if __name__ == "__main__":
    main()
