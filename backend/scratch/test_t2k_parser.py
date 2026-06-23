import os
import re

def parse_t2k_folder(folder_path: str) -> dict:
    ls_files = []
    bdefs_files = []
    cpp_files = []

    for root, dirs, files in os.walk(folder_path):
        for file in files:
            ext = os.path.splitext(file)[1].lower()
            path = os.path.join(root, file)
            if ext == '.ls':
                ls_files.append(path)
            elif ext == '.bdefs':
                bdefs_files.append(path)
            elif ext == '.cpp':
                cpp_files.append(path)

    # 1. Parse Limits
    limit_dict = {}  # "LimitSet.LimitName" -> {min, max, unit}
    for ls_file in ls_files:
        with open(ls_file, 'r', encoding='utf-8', errors='ignore') as f:
            content = f.read()
        
        ls_pattern = re.compile(r'LimitSet\s+(\w+)\s*\{([^}]+)\}', re.MULTILINE)
        for ls_match in ls_pattern.finditer(content):
            ls_name = ls_match.group(1)
            ls_body = ls_match.group(2)
            
            param_pattern = re.compile(r'(\w+)\s*\{\s*WTHT\s*\(\s*([-\d\.eEa-zA-Z]+)\s*,\s*([-\d\.eEa-zA-Z]+)\s*\)', re.MULTILINE)
            for p_match in param_pattern.finditer(ls_body):
                p_name = p_match.group(1)
                val1_str = p_match.group(2)
                val2_str = p_match.group(3)
                
                def split_val_unit(s):
                    m = re.match(r'^([-\d\.eE]+)([a-zA-Z]*)$', s)
                    if m:
                        return float(m.group(1)), m.group(2)
                    return None, ""
                
                v1, u1 = split_val_unit(val1_str)
                v2, u2 = split_val_unit(val2_str)
                if v1 is not None and v2 is not None:
                    max_val = max(v1, v2)
                    min_val = min(v1, v2)
                    unit = u1 or u2
                    limit_dict[f"{ls_name}.{p_name}"] = {"min": min_val, "max": max_val, "unit": unit}

    # 2. Parse Bins
    bin_dict = {} 
    for bdefs_file in bdefs_files:
        with open(bdefs_file, 'r', encoding='utf-8', errors='ignore') as f:
            content = f.read()
        
        leaf_pattern = re.compile(r'LeafBin\s+(\w+)\s+(\d+)\s*:\s*"([^"]+)"')
        for m in leaf_pattern.finditer(content):
            softbin_key = f"SoftBins.{m.group(1)}"
            bin_num = int(m.group(2))
            bin_name = m.group(3)
            bin_dict[softbin_key] = {"sw_bin": bin_num, "hw_bin": bin_num, "bin_name": bin_name}

    # 3. Parse CPP for Judge calls
    params_out = []
    summary_out = []
    seen_bins = set()
    row_no = 1
    
    for cpp_file in cpp_files:
        with open(cpp_file, 'r', encoding='utf-8', errors='ignore') as f:
            lines = f.readlines()
            
        current_function = ""
        # e.g. TPG::T_Leakage_Pre() or void TPG::T_Leakage_Pre()
        func_pattern = re.compile(r'\b\w+::(\w+)\s*\(')
        
        # version 1: Judge(test_id,"ILK_COIL_PRE","Leakage_LS.ILK_COIL",ILK_COIL_PRE[0],"SoftBins.BIN7")
        judge_v1 = re.compile(r'Judge\s*\([^,]+,\s*"([^"]+)"\s*,\s*"([^"]+)"\s*,\s*[^,]+\s*,\s*"([^"]+)"\)')
        
        # version 2: Ips_Library_Base::Judge(test_id,"OS_VIN_PRE",os_mdm_data[0],"-0.6","-0.3","SoftBins.BIN5","SoftBins.BIN6","V")
        judge_v2 = re.compile(r'Ips_Library_Base::Judge\s*\([^,]+,\s*"([^"]+)"\s*,\s*[^,]+\s*,\s*"([^"]+)"\s*,\s*"([^"]+)"\s*,\s*"([^"]+)"\s*,\s*"([^"]+)"\s*,\s*"([^"]*)"\)')
        
        for line in lines:
            func_m = func_pattern.search(line)
            if func_m and "::Judge" not in line: # avoid matching the Judge call itself if it has class scope
                current_function = func_m.group(1)
                
            v1_m = judge_v1.search(line)
            if v1_m:
                param_name = v1_m.group(1)
                limit_key = v1_m.group(2)
                softbin_key = v1_m.group(3)
                
                limits = limit_dict.get(limit_key, {"min": None, "max": None, "unit": ""})
                bin_info = bin_dict.get(softbin_key, {"sw_bin": None, "hw_bin": None, "bin_name": softbin_key})
                
                sw_bin = bin_info["sw_bin"]
                if sw_bin and sw_bin not in seen_bins:
                    seen_bins.add(sw_bin)
                    summary_out.append({
                        "sw_bin": sw_bin,
                        "hw_bin": bin_info["hw_bin"],
                        "bin_name": bin_info["bin_name"]
                    })
                
                params_out.append({
                    "row_no": row_no,
                    "test_no": row_no,
                    "function": current_function,
                    "param": param_name,
                    "symbol": param_name,
                    "min": limits["min"],
                    "max": limits["max"],
                    "unit": limits["unit"],
                    "format": "",
                    "subunit": "",
                    "description": "",
                    "sw_bin": sw_bin,
                    "hw_bin": bin_info["hw_bin"],
                    "qa_min": None,
                    "qa_max": None,
                    "qa_sw_bin": None,
                    "is_qa": False
                })
                row_no += 1
                continue
            
            v2_m = judge_v2.search(line)
            if v2_m:
                # Ips_Library_Base::Judge(test_id, "OS_VIN_PRE", os_mdm_data[0], "-0.6", "-0.3", "SoftBins.BIN5", "SoftBins.BIN6", "V")
                param_name = v2_m.group(1)
                min_str = v2_m.group(2)
                max_str = v2_m.group(3)
                softbin_key = v2_m.group(4)
                # hwbin_key = v2_m.group(5)
                unit = v2_m.group(6)
                
                def parse_float(s):
                    try:
                        return float(s)
                    except ValueError:
                        return None

                min_val = parse_float(min_str)
                max_val = parse_float(max_str)
                if min_val is not None and max_val is not None:
                    real_min = min(min_val, max_val)
                    real_max = max(min_val, max_val)
                else:
                    real_min = min_val
                    real_max = max_val
                    
                bin_info = bin_dict.get(softbin_key, {"sw_bin": None, "hw_bin": None, "bin_name": softbin_key})
                sw_bin = bin_info["sw_bin"]
                if sw_bin and sw_bin not in seen_bins:
                    seen_bins.add(sw_bin)
                    summary_out.append({
                        "sw_bin": sw_bin,
                        "hw_bin": bin_info["hw_bin"],
                        "bin_name": bin_info["bin_name"]
                    })
                    
                params_out.append({
                    "row_no": row_no,
                    "test_no": row_no,
                    "function": current_function,
                    "param": param_name,
                    "symbol": param_name,
                    "min": real_min,
                    "max": real_max,
                    "unit": unit,
                    "format": "",
                    "subunit": "",
                    "description": "",
                    "sw_bin": sw_bin,
                    "hw_bin": bin_info["hw_bin"],
                    "qa_min": None,
                    "qa_max": None,
                    "qa_sw_bin": None,
                    "is_qa": False
                })
                row_no += 1

    if 1 not in seen_bins:
        pass_bin = next((b for b in bin_dict.values() if b["sw_bin"] == 1), {"sw_bin": 1, "hw_bin": 1, "bin_name": "Pass"})
        summary_out.insert(0, pass_bin)
        seen_bins.add(1)

    return {
        "params": params_out,
        "summary": sorted(summary_out, key=lambda x: x["sw_bin"] if x["sw_bin"] else 999),
        "start_function_num": 1
    }

if __name__ == "__main__":
    import json
    res = parse_t2k_folder(r"D:\ATE_DATA\Temp\HL5501WL01_102_V03_T32\HL5501WL01_102_V03_T32")
    print(f"Parsed {len(res['params'])} params and {len(res['summary'])} bins")
    # print(json.dumps(res['params'][:5], indent=2))
