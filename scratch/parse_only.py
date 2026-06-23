import os
import sys
import json
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../backend')))

from app.services.parsers.t2k_parser import parse_t2k_folder

def main():
    folder = r"D:\ATE_DATA\Temp\HL5501WL01_102_V03_T32\HL5501WL01_102_V03_T32"
    res = parse_t2k_folder(folder)
    out_path = r"d:\ATE_DATA\ATE_VPS\backend\uploads\parsed_t2k.json"
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(res, f, ensure_ascii=False)
    print(f"Saved parsed data to {out_path}")
    
    # Also copy TPG.cpp to backend/uploads/extracted_program_HL5501WL01_102_V03_T32/source/test.cpp
    import shutil
    upload_dir = r"d:\ATE_DATA\ATE_VPS\backend\uploads"
    filename = "HL5501WL01_102_V03_T32"
    source_dir = os.path.join(upload_dir, f"extracted_program_{filename}", "source")
    os.makedirs(source_dir, exist_ok=True)
    cpp_source = os.path.join(folder, "TestClasses", "TPG", "TPG.cpp")
    cpp_dest = os.path.join(source_dir, "test.cpp")
    shutil.copy2(cpp_source, cpp_dest)
    print(f"Copied TPG.cpp to {cpp_dest}")

if __name__ == "__main__":
    main()
