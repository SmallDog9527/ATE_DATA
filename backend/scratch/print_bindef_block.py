import os
import sys

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from app.core.config import settings

def main():
    base_name = "HL5083ACP00_204KM_A00_V10"
    pgs_path = os.path.join(settings.UPLOAD_DIR, "pgs_extract", base_name, base_name + ".pgs")
    if not os.path.exists(pgs_path):
        print(f"File not found: {pgs_path}")
        return
        
    with open(pgs_path, "r", encoding="utf-8", errors="ignore") as f:
        lines = f.readlines()
        
    in_block = False
    block_lines = []
    for line in lines:
        stripped = line.strip()
        if stripped == '[Bin Definition Block]':
            in_block = True
            block_lines.append(stripped)
            continue
        if in_block:
            block_lines.append(stripped)
            if stripped.startswith('[') and stripped.endswith(']'):
                break
                
    print(f"Bin Definition Block lines (first 50):")
    for line in block_lines[:50]:
        print(line)

if __name__ == "__main__":
    main()
