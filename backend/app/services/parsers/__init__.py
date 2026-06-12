from app.services.parsers.detector import detect_tester
from app.services.parsers.acco_parser import parse_acco
from app.services.parsers.ets_parser import parse_ets
from app.services.parsers.lbs_acco_parser import parse_lbs
from app.services.parsers.t2k_parser import parse_t2k
from app.services.parsers.base import ParsedData

def parse_file(filepath: str) -> ParsedData:
    """
    Unified parser entry point.
    1. detect_tester identifies the tester type.
    2. LBS routes to lbs_acco_parser.parse_lbs and displays as STS8200.
    3. ETS364 routes to ets_parser.parse_ets.
    4. T2K routes to t2k_parser.parse_t2k.
    5. Other formats route to acco_parser.parse_acco.
    """
    tester = detect_tester(filepath)
    if tester == 'LBS':
        return parse_lbs(filepath, tester)
    elif tester == 'ETS364':
        return parse_ets(filepath, tester)
    elif tester == 'T2K':
        return parse_t2k(filepath, tester)
    else:
        return parse_acco(filepath, tester)
