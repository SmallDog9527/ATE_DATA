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
        
    matching = []
    for idx, line in enumerate(lines):
        if "OS_OPEN" in line.upper():
            matching.append((idx + 1, line.strip()))
            
    print(f"Found {len(matching)} lines containing 'OS_OPEN':")
    for lno, content in matching[:20]:
        print(f"Line {lno}: {content}")

if __name__ == "__main__":
    main()
