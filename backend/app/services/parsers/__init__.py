from app.services.parsers.detector import detect_tester
from app.services.parsers.acco_parser import parse_acco
from app.services.parsers.ets_parser import parse_ets
from app.services.parsers.lbs_acco_parser import parse_lbs
from app.services.parsers.density_fallback_parser import parse_density_fallback
from app.services.parsers.base import ParsedData

def parse_file(filepath: str) -> ParsedData:
    """
    Unified parser entry point with two-tier fallback architecture:
    1. Tier 1: Dedicated parsers (LBS, ETS364, T2K, ACCO/STS8200/STS8300).
    2. Tier 2: Universal density fallback parser (parse_density_fallback) if Tier 1 fails.
    """
    tester = detect_tester(filepath)
    res: ParsedData = None
    try:
        if tester == 'LBS':
            res = parse_lbs(filepath, tester)
        elif tester == 'ETS364':
            res = parse_ets(filepath, tester)
        elif tester == 'T2K':
            res = parse_acco(filepath, tester)
        else:
            res = parse_acco(filepath, tester)
    except Exception as e:
        print(f"[parse_file] Dedicated parser encountered exception for {filepath}: {e}")
        res = None

    # Tier 2: If Tier 1 failed or returned an error, execute universal density fallback parser
    if res is None or res.error is not None or res.data is None or res.data.empty:
        print(f"[parse_file] Dedicated parser failed ({getattr(res, 'error', None)}), falling back to universal density parser for {filepath}")
        try:
            fallback_res = parse_density_fallback(filepath, tester=tester if tester != 'UNKNOWN' else 'ENG')
            if fallback_res and fallback_res.data is not None and not fallback_res.data.empty:
                return fallback_res
        except Exception as ex:
            print(f"[parse_file] Density fallback parser also failed for {filepath}: {ex}")

    return res if res is not None else ParsedData(error="Parsing failed across all parsers")
