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
        
    headers = [line.strip() for line in lines if line.strip().startswith("[") and line.strip().endswith("]")]
    print("Section headers in V10 PGS:")
    for h in headers:
        print(h)
        
    # Let's search for some other keywords
    keywords = ["SWBin", "Bin", "Summary", "Def"]
    for kw in keywords:
        matching = [line.strip() for line in lines if kw in line and (line.strip().startswith("[") or "=" in line)]
        print(f"\nKeyword '{kw}' sample lines (up to 5):")
        for m in matching[:5]:
            print(m)

if __name__ == "__main__":
    main()
