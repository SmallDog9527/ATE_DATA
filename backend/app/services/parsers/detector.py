# ATE tester detection keywords. The file header is matched in priority order.
# LBS is handled first because it requires both '8200' and 'LBS'.
_TESTER_PATTERNS: list[tuple[str, str]] = [
    ('ETS364', 'ETS364'),
    ('STS8300', 'STS8300'),
    ('STS8200', 'STS8200'),
    ('T2K', '[Tester],T2K'),
    ('TMT', '[Tester],TMT'),
]


def detect_tester(filepath: str) -> str:
    """
    Detect the ATE tester type from the file header.

    Returns one of: STS8200, STS8300, ETS364, T2K, TMT, LBS, UNKNOWN.
    """
    try:
        with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
            head = [f.readline() for _ in range(12)]
    except Exception:
        return 'UNKNOWN'

    content = ''.join(head)

    # Detect LBS first: it must contain both '8200' and 'LBS'.
    if '8200' in content and 'LBS' in content:
        return 'LBS'

    if 'ETS' in content:
        return 'ETS364'

    if (
        'Tester Name :' in content
        and 'Program Name :' in content
        and 'Lot Number :' in content
    ):
        return 'T2K'

    for tester_name, keyword in _TESTER_PATTERNS:
        if keyword in content:
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
