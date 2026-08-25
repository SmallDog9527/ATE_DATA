# -*- coding: utf-8 -*-
"""
Tool: add_function_time.py
Description: Automatically injects function execution timing and CSV output logic for test engineering source code.
Features:
  1. Recursively search directory trees at any nesting depth.
  2. Case-insensitive matching for filenames (e.g. test.cpp / Test.cpp, StdAfx.cpp / stdafx.cpp).
  3. StdAfx.cpp: Adds <iostream>, <fstream>, <string> headers at top; adds clearTimeCsv() and writeToTimeCsv() at bottom.
  4. StdAfx.h: Declares writeToTimeCsv() and clearTimeCsv().
  5. test.cpp:
     - Global definitions: int TTR = 1; double start_time = 0;
     - Adds 'if (TTR) clearTimeCsv();' in InitBeforeTestFlow().
     - For each DUT_API int function with funcindex parameter:
       * If CParam is followed by //}}AFX_STS_PARAM_PROTOTYPES, inserts 'if (TTR) start_time = STSSetTimeCheck(0);'
         after //}}AFX_STS_PARAM_PROTOTYPES and preserves an empty line.
       * Adds 'if (TTR) writeToTimeCsv("<FUNCTION_NAME>", start_time);' before 'return 0;'.
"""

import os
import sys
import re
import shutil

def detect_encoding(file_path: str) -> str:
    """Detect file encoding with fallbacks."""
    with open(file_path, 'rb') as f:
        data = f.read()
    if data.startswith(b'\xef\xbb\xbf'):
        return 'utf-8-sig'
    try:
        data.decode('utf-8')
        return 'utf-8'
    except UnicodeDecodeError:
        pass
    try:
        data.decode('gb18030')
        return 'gb18030'
    except UnicodeDecodeError:
        pass
    return 'latin1'

def read_file(file_path: str):
    enc = detect_encoding(file_path)
    with open(file_path, 'r', encoding=enc, errors='ignore') as f:
        content = f.read()
    return content, enc

def write_file(file_path: str, content: str, enc: str):
    with open(file_path, 'w', encoding=enc, newline='') as f:
        f.write(content)

def find_matching_brace(text: str, start_idx: int) -> int:
    """
    Find matching '}' starting from start_idx ('{'), ignoring C/C++ comments and string literals.
    """
    depth = 0
    i = start_idx
    n = len(text)
    in_line_comment = False
    in_block_comment = False
    in_string = False
    in_char = False
    
    while i < n:
        c = text[i]
        c2 = text[i:i+2]
        
        if in_line_comment:
            if c == '\n':
                in_line_comment = False
        elif in_block_comment:
            if c2 == '*/':
                in_block_comment = False
                i += 1
        elif in_string:
            if c == '\\':
                i += 1
            elif c == '"':
                in_string = False
        elif in_char:
            if c == '\\':
                i += 1
            elif c == '\'':
                in_char = False
        else:
            if c2 == '//':
                in_line_comment = True
                i += 1
            elif c2 == '/*':
                in_block_comment = True
                i += 1
            elif c == '"':
                in_string = True
            elif c == '\'':
                in_char = True
            elif c == '{':
                depth += 1
            elif c == '}':
                depth -= 1
                if depth == 0:
                    return i
        i += 1
    return -1

def update_stdafx_cpp(file_path: str, backup: bool = False) -> bool:
    if not os.path.exists(file_path):
        return False

    if backup and not os.path.exists(file_path + ".bak"):
        shutil.copy2(file_path, file_path + ".bak")

    content, enc = read_file(file_path)
    crlf = '\r\n' if '\r\n' in content else '\n'

    # 1. Declare #include <iostream>, <fstream>, <string> at top
    if '#include <iostream>' not in content:
        last_inc = None
        for m in re.finditer(r'^[ \t]*#include\s+["<][^">]+[">][^\n]*\n', content, re.MULTILINE):
            if m.start() < 2000:
                last_inc = m
        if last_inc:
            insert_pos = last_inc.end()
            inc_block = f"{crlf}#include <iostream>{crlf}#include <fstream>{crlf}#include <string>{crlf}"
            content = content[:insert_pos] + inc_block + content[insert_pos:]
        else:
            inc_block = f"#include <iostream>{crlf}#include <fstream>{crlf}#include <string>{crlf}{crlf}"
            content = inc_block + content

    # 2. Add clearTimeCsv and writeToTimeCsv functions at bottom
    if 'void clearTimeCsv()' not in content:
        func_code = f"""{crlf}{crlf}void clearTimeCsv() {{{crlf}\tstd::ofstream file("time.csv", std::ios::out | std::ios::trunc);{crlf}\tif (file.is_open()) {{{crlf}\t\tfile << "test_name,time\\n";{crlf}\t\tfile.close();{crlf}\t\tstd::cout << "time.csv reset" << std::endl;{crlf}\t}}{crlf}\telse {{{crlf}\t\tstd::cerr << "Unable to clear time.csv" << std::endl;{crlf}\t}}{crlf}}}{crlf}{crlf}void writeToTimeCsv(const std::string& testName, double start_time) {{{crlf}\tdouble end_time = STSGetTimeElapsed(0);{crlf}{crlf}\tstd::ifstream checkFile("time.csv");{crlf}\tbool isFirstCall = !checkFile.good();{crlf}\tcheckFile.close();{crlf}{crlf}\tstd::ofstream file;{crlf}\tif (isFirstCall) {{{crlf}\t\tfile.open("time.csv", std::ios::out | std::ios::trunc);{crlf}\t\tif (file.is_open()) {{{crlf}\t\t\tfile << "test_name, time\\n";{crlf}\t\t}}{crlf}\t}}{crlf}\telse {{{crlf}\t\tfile.open("time.csv", std::ios::out | std::ios::app);{crlf}\t}}{crlf}{crlf}\tif (file.is_open()) {{{crlf}\t\tfile << testName << "," << (end_time - start_time) << std::endl;{crlf}\t\tfile.close();{crlf}\t}}{crlf}\telse {{{crlf}\t\tstd::cerr << "Unable to open time.csv" << std::endl;{crlf}\t}}{crlf}}}{crlf}"""
        content = content.rstrip() + func_code

    write_file(file_path, content, enc)
    return True

def update_stdafx_h(file_path: str, backup: bool = False) -> bool:
    if not os.path.exists(file_path):
        return False

    if backup and not os.path.exists(file_path + ".bak"):
        shutil.copy2(file_path, file_path + ".bak")

    content, enc = read_file(file_path)
    crlf = '\r\n' if '\r\n' in content else '\n'

    if 'writeToTimeCsv' not in content:
        decls = f"{crlf}{crlf}extern void writeToTimeCsv(const std::string& testName, double start_time);{crlf}extern void clearTimeCsv();{crlf}"
        content = content.rstrip() + decls

    write_file(file_path, content, enc)
    return True

def process_function_timing(fn_name: str, func_body: str, crlf: str) -> str:
    """
    Process timing injection for a single test function body.
    """
    # 1. Clean existing timing statements
    cleaned = re.sub(r'^[ \t]*if\s*\(\s*TTR\s*\)\s*start_time\s*=\s*STSSetTimeCheck\(0\);[^\n]*\n?', '', func_body, flags=re.MULTILINE)
    cleaned = re.sub(r'^[ \t]*if\s*\(\s*TTR\s*\)\s*writeToTimeCsv\([^;]+\);[^\n]*\n?', '', cleaned, flags=re.MULTILINE)

    # 2. Locate all CParam retrieval statements
    cparam_matches = list(re.finditer(r'^[ \t]*CParam\s*\*\s*\w+\s*=\s*StsGetParam\s*\([^;]+;[^\n]*', cleaned, re.MULTILINE))

    insert_start_pos = -1
    if cparam_matches:
        last_cp = cparam_matches[-1]
        last_cp_end = last_cp.end()
        nl_pos = cleaned.find('\n', last_cp_end)
        if nl_pos == -1:
            nl_pos = last_cp_end
        else:
            nl_pos += 1

        # Check if //}}AFX_STS_PARAM_PROTOTYPES follows immediately
        next_chunk = cleaned[nl_pos:nl_pos+300]
        proto_close_match = re.search(r'^[ \t]*//\s*\}\}\s*AFX_STS_PARAM_PROTOTYPES[^\n]*\n', next_chunk, re.MULTILINE)
        if proto_close_match and proto_close_match.start() < 100:
            proto_end_pos = nl_pos + proto_close_match.end()
            insert_start_pos = proto_end_pos
        else:
            insert_start_pos = nl_pos
    else:
        open_brace = cleaned.find('{')
        insert_start_pos = open_brace + 1 if open_brace != -1 else 0

    # Insert start_time at insert_start_pos with an empty trailing line
    before_part = cleaned[:insert_start_pos]
    after_part = cleaned[insert_start_pos:].lstrip('\r\n')
    
    start_time_block = f"\tif (TTR) start_time = STSSetTimeCheck(0);{crlf}{crlf}"
    with_start = before_part + start_time_block + after_part

    # 3. Insert writeToTimeCsv before return 0;
    ret_matches = list(re.finditer(r'^[ \t]*return\s+0\s*;', with_start, re.MULTILINE))
    if ret_matches:
        last_ret = ret_matches[-1]
        ret_start = last_ret.start()
        write_stmt = f"\tif (TTR)  writeToTimeCsv(\"{fn_name}\", start_time);{crlf}{crlf}"
        result = with_start[:ret_start] + write_stmt + with_start[ret_start:]
    else:
        write_stmt = f"{crlf}\tif (TTR)  writeToTimeCsv(\"{fn_name}\", start_time);{crlf}"
        result = with_start[:-1] + write_stmt + "}"

    return result

def update_test_cpp(file_path: str, backup: bool = False) -> bool:
    if not os.path.exists(file_path):
        return False

    if backup and not os.path.exists(file_path + ".bak"):
        shutil.copy2(file_path, file_path + ".bak")

    content, enc = read_file(file_path)
    crlf = '\r\n' if '\r\n' in content else '\n'

    # 1. Define int TTR = 1; double start_time = 0;
    if not re.search(r'\bint\s+TTR\s*=', content):
        otg_match = re.search(r'(int\s+otg_sat_voltage\s*=\s*[^;\n]+;\s*(?://[^\n]*)?\n)', content)
        if otg_match:
            insert_pos = otg_match.end()
            content = content[:insert_pos] + f"{crlf}int TTR = 1;{crlf}double start_time = 0;{crlf}" + content[insert_pos:]
        else:
            hw_match = re.search(r'^[ \t]*DUT_API\s+void\s+HardWareCfg\s*\(', content, re.MULTILINE)
            if hw_match:
                pos = hw_match.start()
                content = content[:pos] + f"int TTR = 1;{crlf}double start_time = 0;{crlf}{crlf}" + content[pos:]

    # 2. Add if (TTR) clearTimeCsv(); in InitBeforeTestFlow()
    init_match = re.search(r'^[ \t]*DUT_API\s+void\s+InitBeforeTestFlow\s*\(\s*\)', content, re.MULTILINE)
    if init_match:
        open_brace = content.find('{', init_match.end())
        close_brace = find_matching_brace(content, open_brace)
        if open_brace != -1 and close_brace != -1:
            body = content[open_brace:close_brace+1]
            if 'clearTimeCsv()' not in body:
                last_nl = content.rfind('\n', open_brace, close_brace)
                if last_nl != -1:
                    insert_str = f"{crlf}\tif (TTR) clearTimeCsv();{crlf}"
                    content = content[:last_nl] + insert_str + content[last_nl:]

    # 3. Match all DUT_API int test functions with funcindex parameter
    func_header_regex = re.compile(r'^[ \t]*DUT_API\s+int\s+(\w+)\s*\([^)]*funcindex[^)]*\)', re.MULTILINE)
    matches = list(func_header_regex.finditer(content))
    processed_count = 0

    for m in reversed(matches):
        fn_name = m.group(1)
        open_brace = content.find('{', m.end())
        close_brace = find_matching_brace(content, open_brace)
        if open_brace == -1 or close_brace == -1:
            continue

        func_content = content[open_brace:close_brace+1]
        new_func_content = process_function_timing(fn_name, func_content, crlf)

        if new_func_content != func_content:
            content = content[:open_brace] + new_func_content + content[close_brace+1:]
            processed_count += 1

    write_file(file_path, content, enc)
    return True

def locate_all_source_dirs(target_dir: str):
    """
    Recursively locate all source directories containing test.cpp and stdafx.cpp (case-insensitive).
    """
    matched_dirs = []
    
    for root, dirs, files in os.walk(target_dir):
        file_map = {f.lower(): f for f in files}
        
        has_test_cpp = 'test.cpp' in file_map
        has_stdafx_cpp = 'stdafx.cpp' in file_map
        
        if has_test_cpp and has_stdafx_cpp:
            paths = {
                'test_cpp': os.path.join(root, file_map['test.cpp']),
                'stdafx_cpp': os.path.join(root, file_map['stdafx.cpp']),
                'stdafx_h': os.path.join(root, file_map['stdafx.h']) if 'stdafx.h' in file_map else os.path.join(root, 'StdAfx.h')
            }
            matched_dirs.append((root, paths))
            
    return matched_dirs

def process_directory(target_dir: str) -> dict:
    """
    Process all matched project source directories inside target_dir.
    Returns a dictionary of execution results.
    """
    matched_dirs = locate_all_source_dirs(target_dir)
    if not matched_dirs:
        return {
            "success": False,
            "matched_count": 0,
            "message": f"No source directory containing both test.cpp and stdafx.cpp was found in {target_dir}."
        }

    for idx, (d, paths) in enumerate(matched_dirs, 1):
        update_stdafx_cpp(paths['stdafx_cpp'])
        update_stdafx_h(paths['stdafx_h'])
        update_test_cpp(paths['test_cpp'])

    return {
        "success": True,
        "matched_count": len(matched_dirs),
        "message": f"Successfully processed {len(matched_dirs)} source directory(ies)."
    }

def main():
    base_dir = sys.argv[1] if len(sys.argv) > 1 else os.path.dirname(os.path.abspath(__file__))
    result = process_directory(base_dir)
    print(f"Result: {result}")

if __name__ == '__main__':
    main()
