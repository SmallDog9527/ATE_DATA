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
        
    non_empty_last_fields = []
    all_sw_bins = set()
    parts_6_values = set()
    
    for idx, line in enumerate(lines):
        stripped = line.strip()
        if not stripped.startswith('BINData') or '=' not in stripped:
            continue
        _, rest = stripped.split('=', 1)
        parts = [p.strip() for p in rest.split(',')]
        if len(parts) >= 1:
            try:
                all_sw_bins.add(int(parts[0]))
            except ValueError:
                pass
        if len(parts) >= 7:
            parts_6_values.add(parts[6])
        if len(parts) >= 11:
            last_field = parts[10]
            if last_field and last_field != '0000' and last_field != '0':
                non_empty_last_fields.append((idx + 1, stripped, last_field))
                
    print(f"Total BINData lines: {len([l for l in lines if l.strip().startswith('BINData')])}")
    print(f"Distinct sw_bins: {sorted(list(all_sw_bins))}")
    print(f"Distinct parts[6] count: {len(parts_6_values)}")
    print(f"Number of BINData lines with non-empty last field: {len(non_empty_last_fields)}")
    if len(non_empty_last_fields) > 0:
        print("Sample lines with non-empty last field:")
        for lno, content, val in non_empty_last_fields[:10]:
            print(f"Line {lno}: {content} -> Last field: '{val}'")
            
if __name__ == "__main__":
    main()
