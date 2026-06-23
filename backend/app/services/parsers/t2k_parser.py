import os
import re
from dataclasses import dataclass
from typing import Any, Optional


@dataclass
class BinInfo:
    sw_bin: Optional[int]
    hw_bin: Optional[int]
    bin_name: str


def parse_t2k(filepath: str, tester: str = "T2K") -> dict:
    """Compatibility wrapper used by the generic parser registry."""
    return parse_t2k_folder(filepath)


def parse_t2k_folder(folder_path: str) -> dict:
    """
    Parse a T2K program folder into the same shape returned by the PGS parser.

    HL5501 style T2K programs keep limits in OTPLSrc/*.ls, bin definitions in
    *.bdefs, and the parameter-to-limit/bin mapping in TestClasses/TPG/TPG.cpp
    Judge(...) calls.
    """
    ls_files, bdefs_files, cpp_files = _collect_program_files(folder_path)
    limits = _parse_limit_sets(ls_files)
    bins = _parse_bin_defs(bdefs_files)
    cpp_path = find_t2k_main_cpp(cpp_files)
    params = _parse_cpp_params(cpp_path, limits, bins) if cpp_path else []

    used_sw_bins = _used_sw_bins(params)
    if 1 not in used_sw_bins:
        used_sw_bins.add(1)

    summary = []
    seen_summary_bins: set[int] = set()
    for _, info in sorted(
        bins.items(),
        key=lambda item: item[1].sw_bin if item[1].sw_bin is not None else 999999,
    ):
        if info.sw_bin is None or info.sw_bin not in used_sw_bins or info.sw_bin in seen_summary_bins:
            continue
        seen_summary_bins.add(info.sw_bin)
        summary.append(
            {
                "sw_bin": info.sw_bin,
                "hw_bin": info.hw_bin,
                "bin_name": info.bin_name,
            }
        )

    return {
        "params": params,
        "summary": summary,
        "start_function_num": 1,
        "pgs_version": None,
        "program_version": _extract_program_version(folder_path),
    }


def _collect_program_files(folder_path: str) -> tuple[list[str], list[str], list[str]]:
    ls_files: list[str] = []
    bdefs_files: list[str] = []
    cpp_files: list[str] = []

    for root, _dirs, files in os.walk(folder_path):
        for filename in files:
            ext = os.path.splitext(filename)[1].lower()
            path = os.path.join(root, filename)
            if ext == ".ls":
                ls_files.append(path)
            elif ext == ".bdefs":
                bdefs_files.append(path)
            elif ext == ".cpp":
                cpp_files.append(path)

    ls_files.sort(key=_t2k_file_priority)
    bdefs_files.sort(key=_t2k_file_priority)
    cpp_files.sort(key=_t2k_file_priority)
    return ls_files, bdefs_files, cpp_files


def _t2k_file_priority(path: str) -> tuple[int, str]:
    normalized = path.replace("\\", "/").lower()
    if "/otplsrc/" in normalized:
        bucket = 0
    elif "/testclasses/tpg/" in normalized:
        bucket = 1
    else:
        bucket = 2
    return bucket, normalized


def find_t2k_main_cpp(cpp_files: list[str]) -> Optional[str]:
    """Pick the generated test-class cpp instead of assuming TestClasses/TPG/TPG.cpp."""
    if not cpp_files:
        return None

    scored = []
    for path in cpp_files:
        scored.append((_score_t2k_cpp(path), path.replace("\\", "/").lower(), path))
    scored.sort(key=lambda item: (-item[0], item[1]))
    return scored[0][2]


def _score_t2k_cpp(path: str) -> int:
    normalized = path.replace("\\", "/").lower()
    basename = os.path.basename(path).lower()
    score = 0

    if "/testclasses/" in normalized:
        score += 100
    if "/testclasses/inc/" in normalized:
        score -= 80
    if "/old/" in normalized:
        score -= 50
    if basename.endswith("_dllsetup.cpp"):
        score -= 100
    if basename in {"ips_library_base.cpp", "ips_testplan_setup.cpp", "ips_testplan_setup_auxiliary.cpp"}:
        score -= 80
    if basename == "tpg.cpp":
        score += 20

    try:
        text = _read_text(path)
    except OSError:
        return score

    text_head = text[:4096]
    if "TestClass name:" in text_head:
        score += 250
    if re.search(r'#include\s+["<].*\.pds[">]', text_head, re.IGNORECASE):
        score += 60
    if re.search(r'\b(?:TPG|HL\d+[A-Za-z0-9_]*)::execute\s*\(', text):
        score += 120
    if re.search(r'\b(?:TPG|HL\d+[A-Za-z0-9_]*)::registerObjects\s*\(', text):
        score += 80

    score += min(len(re.findall(r'(?<![A-Za-z0-9_])(?:Ips_Library_Base::)?Judge\s*\(', text)), 200)
    score += min(len(re.findall(r'(?<![A-Za-z0-9_])judge_pds\s*\(', text)), 200)
    return score


def _read_text(path: str) -> str:
    with open(path, "rb") as fp:
        raw = fp.read()
    for enc in ("utf-8", "gbk", "latin-1"):
        try:
            return raw.decode(enc)
        except UnicodeDecodeError:
            continue
    return raw.decode("utf-8", errors="ignore")


def _strip_comments(text: str) -> str:
    out: list[str] = []
    i = 0
    in_line_comment = False
    in_block_comment = False
    in_string = False
    escape = False

    while i < len(text):
        ch = text[i]
        nxt = text[i + 1] if i + 1 < len(text) else ""

        if in_line_comment:
            if ch == "\n":
                in_line_comment = False
                out.append(ch)
            else:
                out.append(" ")
            i += 1
            continue

        if in_block_comment:
            if ch == "*" and nxt == "/":
                out.extend("  ")
                in_block_comment = False
                i += 2
            else:
                out.append("\n" if ch == "\n" else " ")
                i += 1
            continue

        if in_string:
            out.append(ch)
            if escape:
                escape = False
            elif ch == "\\":
                escape = True
            elif ch == '"':
                in_string = False
            i += 1
            continue

        if ch == "/" and nxt == "/":
            out.extend("  ")
            in_line_comment = True
            i += 2
            continue
        if ch == "/" and nxt == "*":
            out.extend("  ")
            in_block_comment = True
            i += 2
            continue
        if ch == '"':
            in_string = True

        out.append(ch)
        i += 1

    return "".join(out)


def _parse_limit_sets(ls_files: list[str]) -> dict[str, dict[str, Any]]:
    limits: dict[str, dict[str, Any]] = {}

    for path in ls_files:
        text = _strip_comments(_read_text(path))
        for match in re.finditer(r"\bLimitSet\s+([A-Za-z_]\w*)\s*\{", text):
            limit_set = match.group(1)
            block = _extract_braced_block(text, match.end() - 1)
            if not block:
                continue
            body, _end = block
            for entry in re.finditer(
                r"\b([A-Za-z_]\w*)\s*\{\s*WTHT\s*\(\s*([^,]+?)\s*,\s*([^)]+?)\s*\)",
                body,
                re.DOTALL,
            ):
                name = entry.group(1)
                first = _parse_number_unit(entry.group(2))
                second = _parse_number_unit(entry.group(3))
                if not first or not second:
                    continue

                first_num, first_unit = first
                second_num, second_unit = second
                unit = first_unit or second_unit
                min_value = min(first_num, second_num)
                max_value = max(first_num, second_num)
                limits[f"{limit_set}.{name}"] = {
                    "min": min_value,
                    "max": max_value,
                    "unit": unit,
                    "source": os.path.basename(path),
                }

    return limits


def _parse_bin_defs(bdefs_files: list[str]) -> dict[str, BinInfo]:
    bins: dict[str, BinInfo] = {}
    hard_bins: dict[str, int] = {}

    for path in bdefs_files:
        text = _strip_comments(_read_text(path))
        for hard in re.finditer(
            r"\bBin\s+([A-Za-z_]\w*)\s+(\d+)\s*:\s*\"([^\"]*)\"",
            text,
        ):
            hard_bins[hard.group(1)] = int(hard.group(2))

        for leaf in re.finditer(
            r"\bLeafBin\s+([A-Za-z_]\w*)\s+(\d+)\s*:\s*\"([^\"]*)\"\s*,\s*([A-Za-z_]\w*)",
            text,
        ):
            name = leaf.group(1)
            sw_bin = int(leaf.group(2))
            bin_name = leaf.group(3).strip() or name
            hard_name = leaf.group(4)
            hw_bin = hard_bins.get(hard_name, sw_bin)
            info = BinInfo(sw_bin=sw_bin, hw_bin=hw_bin, bin_name=bin_name)
            bins[f"SoftBins.{name}"] = info
            bins[name] = info

    if "SoftBins.PassAll" not in bins:
        pass_bin = BinInfo(sw_bin=1, hw_bin=1, bin_name="Pass")
        bins["SoftBins.PassAll"] = pass_bin
        bins["PassAll"] = pass_bin

    return bins


def _parse_cpp_params(
    cpp_path: str,
    limits: dict[str, dict[str, Any]],
    bins: dict[str, BinInfo],
) -> list[dict[str, Any]]:
    text = _strip_comments(_read_text(cpp_path))
    function_ranges = _find_cpp_functions(text)
    rows: list[dict[str, Any]] = []

    pds_tables = _parse_pds_tables(text, cpp_path)

    for function in function_ranges:
        body = text[function["body_start"]:function["body_end"]]
        test_id_value = _initial_test_id(body)
        calls = _find_judge_calls(body)
        pds_calls = _find_judge_pds_calls(body)
        pds_next_index: dict[str, int] = {}

        for call in calls:
            args = _split_cpp_args(call["args"])
            if len(args) < 5:
                continue

            test_no = _test_number(args[0], test_id_value, len(rows) + 1)
            if re.fullmatch(r"test_id", args[0].strip()) and test_id_value is not None:
                test_id_value += 1

            param_name = _unquote(args[1])
            if not param_name:
                continue

            parsed = _parse_judge_args(args, limits, bins)
            if not parsed:
                continue

            sw_bin = parsed["sw_bin"]
            hw_bin = parsed["hw_bin"]
            row_no = len(rows) + 1
            rows.append(
                {
                    "row_no": row_no,
                    "test_no": test_no,
                    "function": function["name"],
                    "param": param_name,
                    "symbol": param_name,
                    "min": parsed["min"],
                    "max": parsed["max"],
                    "unit": parsed["unit"],
                    "format": "",
                    "subunit": "",
                    "description": parsed.get("description", ""),
                    "sw_bin": sw_bin,
                    "hw_bin": hw_bin,
                    "qa_min": None,
                    "qa_max": None,
                    "qa_sw_bin": None,
                    "is_qa": False,
                    "cpp_line": _line_no(text, function["body_start"] + call["start"]),
                    "limit_ref": parsed.get("limit_ref"),
                    "bin_ref": parsed.get("bin_ref"),
                }
            )

        for call in pds_calls:
            args = _split_cpp_args(call["args"])
            if len(args) < 4:
                continue
            table_name = args[1].strip()
            if table_name not in pds_tables:
                continue
            pds_index = _literal_int(args[3])
            table_rows = pds_tables[table_name]
            if pds_index is None:
                pds_index = pds_next_index.get(table_name, 0)
                selected_rows = [table_rows[pds_index]] if pds_index < len(table_rows) else []
                pds_next_index[table_name] = pds_index + 1
            elif 0 <= pds_index < len(table_rows):
                selected_rows = [table_rows[pds_index]]
                pds_next_index[table_name] = max(pds_next_index.get(table_name, 0), pds_index + 1)
            else:
                selected_rows = []

            for pds_row in selected_rows:
                param_name = pds_row.get("name")
                if not param_name:
                    continue
                row_no = len(rows) + 1
                rows.append(
                    {
                        "row_no": row_no,
                        "test_no": pds_row.get("test_no") or row_no,
                        "function": function["name"],
                        "param": param_name,
                        "symbol": param_name,
                        "min": pds_row.get("min"),
                        "max": pds_row.get("max"),
                        "unit": pds_row.get("unit", ""),
                        "format": "",
                        "subunit": "",
                        "description": pds_row.get("description", ""),
                        "sw_bin": pds_row.get("sw_bin"),
                        "hw_bin": pds_row.get("hw_bin"),
                        "qa_min": None,
                        "qa_max": None,
                        "qa_sw_bin": None,
                        "is_qa": False,
                        "cpp_line": _line_no(text, function["body_start"] + call["start"]),
                        "limit_ref": None,
                        "bin_ref": pds_row.get("bin_ref"),
                    }
                )

    return rows


def _find_cpp_functions(text: str) -> list[dict[str, Any]]:
    functions: list[dict[str, Any]] = []
    pattern = re.compile(
        r"(?:\b[A-Za-z_]\w*[\w:<>,\s*&~]*\s+)?\b([A-Za-z_]\w*)::([A-Za-z_]\w*)\s*\([^;{}]*\)\s*\{"
    )

    for match in pattern.finditer(text):
        class_name = match.group(1)
        member_name = match.group(2)
        if class_name in {"std", "OFCStringUtils", "rdk", "ATCP_Base", "Ips_Library_Base"}:
            continue
        block = _extract_braced_block(text, match.end() - 1)
        if not block:
            continue
        _body, end_pos = block
        functions.append(
            {
                "name": member_name,
                "class": class_name,
                "start": match.start(),
                "body_start": match.end(),
                "body_end": end_pos - 1,
                "end": end_pos,
            }
        )

    functions.sort(key=lambda item: item["start"])
    return functions


def _extract_braced_block(text: str, open_pos: int) -> Optional[tuple[str, int]]:
    if open_pos < 0 or open_pos >= len(text) or text[open_pos] != "{":
        return None

    depth = 0
    in_string = False
    escape = False
    start = open_pos + 1

    for i in range(open_pos, len(text)):
        ch = text[i]
        if in_string:
            if escape:
                escape = False
            elif ch == "\\":
                escape = True
            elif ch == '"':
                in_string = False
            continue

        if ch == '"':
            in_string = True
            continue
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return text[start:i], i + 1

    return None


def _find_judge_calls(body: str) -> list[dict[str, Any]]:
    calls: list[dict[str, Any]] = []
    pattern = re.compile(r"(?<![A-Za-z0-9_])(?:(?:Ips_Library_Base|this)\s*::\s*)?Judge\s*\(")

    for match in pattern.finditer(body):
        open_pos = body.find("(", match.start())
        close_pos = _find_matching_paren(body, open_pos)
        if close_pos is None:
            continue
        calls.append(
            {
                "start": match.start(),
                "end": close_pos + 1,
                "args": body[open_pos + 1:close_pos],
            }
        )

    return calls


def _find_judge_pds_calls(body: str) -> list[dict[str, Any]]:
    calls: list[dict[str, Any]] = []
    pattern = re.compile(r"(?<![A-Za-z0-9_])judge_pds\s*\(")

    for match in pattern.finditer(body):
        open_pos = body.find("(", match.start())
        close_pos = _find_matching_paren(body, open_pos)
        if close_pos is None:
            continue
        calls.append(
            {
                "start": match.start(),
                "end": close_pos + 1,
                "args": body[open_pos + 1:close_pos],
            }
        )

    return calls


def _parse_pds_tables(text: str, cpp_path: str) -> dict[str, list[dict[str, Any]]]:
    tables: dict[str, list[dict[str, Any]]] = {}
    search_texts = [text]

    for include_path in _find_included_pds_files(text, cpp_path):
        try:
            search_texts.append(_read_text(include_path))
        except OSError:
            continue

    for search_text in search_texts:
        for name, rows in _parse_pds_tables_from_text(search_text).items():
            tables.setdefault(name, rows)

    return tables


def _find_included_pds_files(text: str, cpp_path: str) -> list[str]:
    paths: list[str] = []
    cpp_dir = os.path.dirname(cpp_path)
    for match in re.finditer(r'#include\s+"([^"]+\.pds)"', text, re.IGNORECASE):
        include_name = match.group(1).replace("\\", os.sep).replace("/", os.sep)
        include_path = os.path.normpath(os.path.join(cpp_dir, include_name))
        if os.path.exists(include_path):
            paths.append(include_path)
    return paths


def _parse_pds_tables_from_text(text: str) -> dict[str, list[dict[str, Any]]]:
    tables: dict[str, list[dict[str, Any]]] = {}
    pattern = re.compile(r"\bchar\s*\*\s*([A-Za-z_]\w*)\s*\[\s*\]\s*\[\s*8\s*\]\s*=\s*\{")

    for match in pattern.finditer(text):
        block = _extract_braced_block(text, match.end() - 1)
        if not block:
            continue
        body, _end = block
        rows: list[dict[str, Any]] = []
        for row_match in re.finditer(r"\{([^{}]*)\}", body, re.DOTALL):
            values = re.findall(r'"([^"]*)"', row_match.group(1))
            if len(values) < 8:
                continue
            test_no = _literal_int(values[0])
            lower = _literal_float(values[2])
            upper = _literal_float(values[3])
            unit = _normalize_unit_label(values[5])
            lower_bin = values[6].strip()
            upper_bin = values[7].strip()
            rows.append(
                {
                    "test_no": test_no,
                    "name": values[1].strip(),
                    "min": min(lower, upper) if lower is not None and upper is not None else lower,
                    "max": max(lower, upper) if lower is not None and upper is not None else upper,
                    "unit": unit,
                    "sw_bin": _pds_sw_bin(lower_bin, upper_bin),
                    "hw_bin": _pds_sw_bin(lower_bin, upper_bin),
                    "description": _merge_bin_values(lower_bin, upper_bin),
                    "bin_ref": _merge_bin_values(lower_bin, upper_bin),
                }
            )
        if rows:
            tables[match.group(1)] = rows
    return tables


def _find_matching_paren(text: str, open_pos: int) -> Optional[int]:
    depth = 0
    in_string = False
    escape = False

    for i in range(open_pos, len(text)):
        ch = text[i]
        if in_string:
            if escape:
                escape = False
            elif ch == "\\":
                escape = True
            elif ch == '"':
                in_string = False
            continue

        if ch == '"':
            in_string = True
            continue
        if ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
            if depth == 0:
                return i

    return None


def _split_cpp_args(args: str) -> list[str]:
    parts: list[str] = []
    start = 0
    paren_depth = 0
    bracket_depth = 0
    brace_depth = 0
    in_string = False
    escape = False

    for i, ch in enumerate(args):
        if in_string:
            if escape:
                escape = False
            elif ch == "\\":
                escape = True
            elif ch == '"':
                in_string = False
            continue

        if ch == '"':
            in_string = True
            continue
        if ch == "(":
            paren_depth += 1
        elif ch == ")":
            paren_depth -= 1
        elif ch == "[":
            bracket_depth += 1
        elif ch == "]":
            bracket_depth -= 1
        elif ch == "{":
            brace_depth += 1
        elif ch == "}":
            brace_depth -= 1
        elif (
            ch == ","
            and paren_depth == 0
            and bracket_depth == 0
            and brace_depth == 0
        ):
            parts.append(args[start:i].strip())
            start = i + 1

    tail = args[start:].strip()
    if tail:
        parts.append(tail)
    return parts


def _parse_judge_args(
    args: list[str],
    limits: dict[str, dict[str, Any]],
    bins: dict[str, BinInfo],
) -> Optional[dict[str, Any]]:
    # Judge(id, desc, "LimitSet.Param", value, "SoftBins.BIN7")
    if len(args) == 5 and _is_string_literal(args[2]) and _is_string_literal(args[4]):
        limit_ref = _unquote(args[2])
        limit = limits.get(limit_ref, {"min": None, "max": None, "unit": ""})
        bin_ref = _unquote(args[4])
        bin_info = _bin_info(bin_ref, bins)
        return {
            "min": limit.get("min"),
            "max": limit.get("max"),
            "unit": limit.get("unit", ""),
            "sw_bin": bin_info["sw_bin"],
            "hw_bin": bin_info["hw_bin"],
            "description": bin_info["description"],
            "limit_ref": limit_ref,
            "bin_ref": bin_ref,
        }

    # Judge(id, desc, value, lower, upper, lowerBin, upperBin, unit)
    if len(args) >= 8 and _is_string_literal(args[5]) and _is_string_literal(args[6]):
        lower = _literal_float(args[3])
        upper = _literal_float(args[4])
        unit = _unquote(args[7]) if _is_string_literal(args[7]) else args[7].strip()
        normalized = _normalize_direct_limits(lower, upper, unit)
        lower_bin_ref = _unquote(args[5])
        upper_bin_ref = _unquote(args[6])
        lower_bin = _bin_info(lower_bin_ref, bins)
        upper_bin = _bin_info(upper_bin_ref, bins)
        return {
            "min": normalized["min"],
            "max": normalized["max"],
            "unit": normalized["unit"],
            "sw_bin": _merge_bin_values(lower_bin["sw_bin"], upper_bin["sw_bin"]),
            "hw_bin": _merge_bin_values(lower_bin["hw_bin"], upper_bin["hw_bin"]),
            "description": _merge_bin_values(lower_bin["description"], upper_bin["description"]),
            "limit_ref": None,
            "bin_ref": _merge_bin_values(lower_bin_ref, upper_bin_ref),
        }

    return None


def _parse_number_unit(value: str) -> Optional[tuple[float, str]]:
    token = value.strip().strip(";")
    token = _unquote(token)
    match = re.fullmatch(
        r"([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)\s*([A-Za-z][A-Za-z0-9_/\-]*)?",
        token,
    )
    if not match:
        return None
    unit = _normalize_unit_label(match.group(2) or "")
    return float(match.group(1)), unit


def _literal_float(value: str) -> Optional[float]:
    parsed = _parse_number_unit(value)
    return parsed[0] if parsed else None


def _literal_int(value: str) -> Optional[int]:
    token = _unquote(value.strip())
    match = re.fullmatch(r"[+-]?\d+", token)
    return int(token) if match else None


def _pds_sw_bin(lower_bin: str, upper_bin: str) -> Any:
    def parse_bin(value: str) -> Optional[int]:
        match = re.search(r"BIN(\d+)", value, re.IGNORECASE)
        if match:
            return int(match.group(1))
        if value.lower().endswith("passall"):
            return 1
        return None

    return _merge_bin_values(parse_bin(lower_bin), parse_bin(upper_bin))


def _normalize_direct_limits(
    lower: Optional[float],
    upper: Optional[float],
    unit: str,
) -> dict[str, Any]:
    unit = _normalize_unit_label(unit)
    if lower is not None and upper is not None:
        min_value = min(lower, upper)
        max_value = max(lower, upper)
    else:
        min_value = lower
        max_value = upper

    if unit == "V" and min_value is not None and max_value is not None and max(abs(min_value), abs(max_value)) <= 1:
        return {"min": min_value * 1000, "max": max_value * 1000, "unit": "mV"}

    return {"min": min_value, "max": max_value, "unit": unit}


def _normalize_unit_label(unit: str) -> str:
    raw = unit.strip().strip('"')
    if not raw:
        return ""
    canonical = {
        "V", "mV", "uV", "nV",
        "A", "mA", "uA", "nA",
        "Ohms", "mOhms", "KOhms", "MOhms",
        "Hz", "KHz", "MHz", "GHz",
        "S", "mS", "uS", "nS",
    }
    if raw in canonical:
        return raw
    lowered = raw.lower()
    aliases = {
        "kohm": "KOhms",
        "kohms": "KOhms",
        "ohm": "Ohms",
        "ohms": "Ohms",
        "mv": "mV",
        "uv": "uV",
        "ma": "mA",
        "ua": "uA",
        "ms": "mS",
        "us": "uS",
        "khz": "KHz",
        "mhz": "MHz",
        "hz": "Hz",
    }
    return aliases.get(lowered, raw)


def _bin_info(bin_ref: str, bins: dict[str, BinInfo]) -> dict[str, Any]:
    info = bins.get(bin_ref) or bins.get(bin_ref.split(".")[-1])
    if not info:
        return {
            "sw_bin": None,
            "hw_bin": None,
            "description": bin_ref,
        }
    return {
        "sw_bin": info.sw_bin,
        "hw_bin": info.hw_bin,
        "description": info.bin_name,
    }


def _merge_bin_values(left: Any, right: Any) -> Any:
    if left == right:
        return left
    if left in (None, ""):
        return right
    if right in (None, ""):
        return left
    return f"{left}/{right}"


def _used_sw_bins(rows: list[dict[str, Any]]) -> set[int]:
    used: set[int] = set()
    for row in rows:
        value = row.get("sw_bin")
        if isinstance(value, int):
            used.add(value)
        else:
            for token in str(value or "").split("/"):
                try:
                    used.add(int(token))
                except ValueError:
                    pass
    return used


def _initial_test_id(body: str) -> Optional[int]:
    match = re.search(r"\bint\s+test_id\s*=\s*(\d+)\s*;", body)
    return int(match.group(1)) if match else None


def _test_number(expr: str, test_id_value: Optional[int], fallback: int) -> int:
    token = expr.strip()
    if re.fullmatch(r"\d+", token):
        return int(token)
    if re.fullmatch(r"test_id", token) and test_id_value is not None:
        return test_id_value
    return fallback


def _line_no(text: str, offset: int) -> int:
    return text.count("\n", 0, offset) + 1


def _is_string_literal(value: str) -> bool:
    value = value.strip()
    return len(value) >= 2 and value[0] == '"' and value[-1] == '"'


def _unquote(value: str) -> str:
    value = value.strip()
    if _is_string_literal(value):
        return value[1:-1].replace(r"\"", '"')
    return value


def _extract_program_version(path: str) -> Optional[str]:
    return os.path.basename(os.path.normpath(path))
