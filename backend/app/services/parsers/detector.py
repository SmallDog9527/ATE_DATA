import os
import re

# ATE tester detection keywords. The file header is matched in priority order.
# LBS is handled first because it requires both '8200' and 'LBS'.
_TESTER_PATTERNS: list[tuple[str, str]] = [
    ('ETS364', 'ETS364'),
    ('STS8300', 'STS8300'),
    ('STS8200', 'STS8200'),
    ('VG34', 'VG34'),
    ('T2K', '[Tester],T2K'),
    ('TMT', '[Tester],TMT'),
]


def detect_tester(filepath: str) -> str:
    """
    Detect the ATE tester type from the file header.

    Returns one of: STS8200, STS8300, ETS364, VG34, T2K, TMT, LBS, UNKNOWN.
    """
    try:
        with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
            head = [f.readline() for _ in range(15)]
    except Exception:
        return 'UNKNOWN'

    content = ''.join(head)
    content_lower = content.lower()
    norm_content = re.sub(r'[ \t]+', ' ', content)

    # 针对 LBS 传入的 T2K 数据定制识别规则：
    # 如果含有 'LBS'，并且表头中没有 acco, sts8200, 或 ets 字样，则判定为 T2K 机台
    if 'LBS' in content:
        if 'acco' not in content_lower and 'sts8200' not in content_lower and 'ets' not in content_lower:
            return 'T2K'

    # Detect LBS first: it must contain both '8200' and 'LBS'.
    if '8200' in content and 'LBS' in content:
        return 'LBS'

    if 'ETS' in content:
        return 'ETS364'

    if 'VG34' in content:
        return 'VG34'

    if 'T32' in filepath.upper():
        return 'T2K'

    if (
        'Tester Name :' in norm_content
        and 'Program Name :' in norm_content
        and 'Lot Number :' in norm_content
    ):
        return 'T2K'

    for tester_name, keyword in _TESTER_PATTERNS:
        if keyword in content or keyword in norm_content:
            return tester_name

    return 'UNKNOWN'


def detect_test_stage(filename: str, has_coords: bool) -> str:
    """
    Detect the displayed test type from parsed data content.

    Business rule: any dataset with valid wafer coordinates is CP; otherwise FT.
    The filename is intentionally ignored so tokens such as FT/PT/RT do not
    override the actual data shape.
    """
    if 'QA' in filename.upper():
        return 'QA'
    return 'CP' if has_coords else 'FT'
