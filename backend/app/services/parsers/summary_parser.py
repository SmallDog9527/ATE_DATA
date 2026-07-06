import re
import os
from datetime import datetime
from typing import Optional
from sqlalchemy.orm import Session

def parse_summary_datetime(raw_dt_str: str) -> Optional[datetime]:
    if not raw_dt_str:
        return None
    s = re.sub(r'\s+', ' ', raw_dt_str.strip())
    # 尝试各种常见的时间格式
    formats = [
        '%m/%d/%Y %H:%M:%S',
        '%m-%d-%Y %H:%M:%S',
        '%Y/%m/%d %H:%M:%S',
        '%Y-%m-%d %H:%M:%S',
        '%Y-%m-%d %I:%M:%S %p',
        '%m/%d/%Y %I:%M:%S %p',
        '%Y/%m/%d %I:%M:%S %p',
        '%m/%d/%Y',
        '%Y/%m/%d',
        '%Y-%m-%d',
    ]
    for fmt in formats:
        try:
            return datetime.strptime(s, fmt)
        except ValueError:
            continue
    return None

def parse_summary_txt(filepath: str) -> dict:
    """
    解析 ETS Summary 报表文件 (.txt)。
    提取：
    1. 测试开始时间: Data Collection Start Date
    2. 测试结束时间: Data Collection Stop Date
    3. 程序名: Test Name
    4. 遇到的第一个Bin#与第二个Bin#之间的Bin信息（只提取 Sfwr Bin 中的软件Bin与Bin Name）。
    """
    from typing import Optional

    result = {
        'beginning_time': None,
        'ending_time': None,
        'bins': {},
        'program': None,
        'tester': None,
        'probecard': None,
        'lot_id': None,
        'wafer_id': None,
        'handler': None,
        'die_count': None,
        'pass_count': None,
        'fail_count': None,
        'yield_rate': None,
    }

    try:
        with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
            content = f.read()
    except Exception as e:
        print(f"[parse_summary] 读取文件出错 {filepath}: {e}")
        return result

    # 提取晶圆测试统计数据 (die_count, pass, fail, yield)
    perf_match = re.search(r'DUTs Tested.*?Yield Percentage.*?\n[-+\s]*\n\s*(\d+)\s*\|\s*(\d+)\s*\|\s*(\d+)\s*\|\s*([\d\.]+)', content, re.IGNORECASE | re.DOTALL)
    if perf_match:
        result['die_count'] = int(perf_match.group(1))
        result['pass_count'] = int(perf_match.group(2))
        result['fail_count'] = int(perf_match.group(3))
        result['yield_rate'] = float(perf_match.group(4)) / 100.0

    # 限制解析内容为从开头到出现Hdwr之前的内容
    hdwr_pos_trunc = content.lower().find('hdwr')
    if hdwr_pos_trunc != -1:
        content = content[:hdwr_pos_trunc]

    # 1. 解析程序名 (Test Name)
    test_name_match = re.search(r'Test Name:\s*([^\r\n]*)', content, re.IGNORECASE)
    if test_name_match:
        result['program'] = test_name_match.group(1).strip()

    lot_match = re.search(r'Report for Lot:\s*([^\r\n]*)', content, re.IGNORECASE)
    if lot_match:
        result['lot_id'] = lot_match.group(1).strip()

    sublot_match = re.search(r'Report for SubLot:\s*([^\r\n]*)', content, re.IGNORECASE)
    if sublot_match:
        result['wafer_id'] = sublot_match.group(1).strip()

    handler_match = re.search(r'(?:Handler/Prober ID|Handler ID|Handler|Prober ID|Prober):\s*([^\r\n]*)', content, re.IGNORECASE)
    if handler_match:
        result['handler'] = handler_match.group(1).strip()

    # 2. 解析测试时间
    start_match = re.search(r'Data Collection Start Date:\s*([^\r\n]*)', content, re.IGNORECASE)
    stop_match = re.search(r'Data Collection Stop\s+Date:\s*([^\r\n]*)', content, re.IGNORECASE)

    if start_match:
        raw_start = start_match.group(1).strip()
        result['beginning_time'] = parse_summary_datetime(raw_start)

    if stop_match:
        raw_stop = stop_match.group(1).strip()
        result['ending_time'] = parse_summary_datetime(raw_stop)

    # 2.5 解析 Tester / Probe Card 信息
    tester_match = re.search(r'(?:Tester ID|Tester|Station|Test Station|Test-Station|Test_Station):\s*([^\r\n]*)', content, re.IGNORECASE)
    probecard_match = re.search(r'(?:Probe Card ID|Probe Card|ProbeCard|Probecard|Probe-Card|Probe_Card):\s*([^\r\n]*)', content, re.IGNORECASE)
    if tester_match:
        result['tester'] = tester_match.group(1).strip()
    if probecard_match:
        result['probecard'] = probecard_match.group(1).strip()

    # 3. 解析分Bin信息（Sfwr Bin 与 Hdwr Bin 之间的所有 bin 定义）
    sfwr_pos = content.find('Sfwr   Bin')
    hdwr_pos = content.find('Hdwr   Bin')

    if sfwr_pos != -1:
        if hdwr_pos != -1 and hdwr_pos > sfwr_pos:
            section = content[sfwr_pos:hdwr_pos]
        else:
            section = content[sfwr_pos:]

        lines = section.splitlines()
        in_table = False
        for line in lines:
            if '------' in line:
                in_table = True
                continue
            if not in_table:
                continue
            
            # 使用固定宽度切片或正则解析
            # 例如: "    1     P    Pass                         3615      60.66"
            if len(line) >= 43:
                bin_num_str = line[0:6].strip()
                bin_type = line[6:13].strip()
                bin_desc = line[13:43].strip()
                bin_count_str = line[43:53].strip()

                if bin_num_str.isdigit():
                    bin_num = int(bin_num_str)
                    bin_count = int(bin_count_str) if bin_count_str.isdigit() else 0
                    result['bins'][bin_num] = {
                        'name': bin_desc,
                        'type': bin_type,
                        'count': bin_count
                    }

    return result


def get_summary_filename(csv_filename: str) -> str:
    """
    根据 csv 文件名生成对应的 Summary txt 文件名。
    特性：在中间加上 SUMMARY_REPORT_。
    通常是把 _ETS 替换成 _SUMMARY_REPORT_ETS。
    """
    base, ext = os.path.splitext(csv_filename)
    
    for ets_pat in ['_ETS', '_ets', 'ETS', 'ets']:
        if ets_pat in base:
            idx = base.rfind(ets_pat)
            if idx != -1:
                if ets_pat.startswith('_'):
                    return base[:idx] + '_SUMMARY_REPORT' + base[idx:] + '.txt'
                else:
                    return base[:idx] + 'SUMMARY_REPORT_' + base[idx:] + '.txt'

    return base + '_SUMMARY_REPORT.txt'


def find_corresponding_csv_filename(summary_filename: str) -> str:
    """
    根据 Summary txt 文件名找对应的 csv 文件名。
    即去掉文件名中的 SUMMARY_REPORT_，后缀改成 .csv。
    """
    base, ext = os.path.splitext(summary_filename)
    
    clean_base = re.sub(r'_SUMMARY_REPORT_', '_', base, flags=re.IGNORECASE)
    clean_base = re.sub(r'_SUMMARY_REPORT', '', clean_base, flags=re.IGNORECASE)
    clean_base = re.sub(r'SUMMARY_REPORT_', '', clean_base, flags=re.IGNORECASE)
    clean_base = re.sub(r'SUMMARY_REPORT', '', clean_base, flags=re.IGNORECASE)
    
    return clean_base + '.csv'


def save_program_bin_names_from_summary(db: Session, program: str, bins: dict):
    """
    将 Summary 文件解析到的 {bin_number: bin_name} 信息
    保存（upsert）到 ProgramBinName 表中。
    后续无 Summary 的 CSV 上传时可从该表查询到实际 Bin 名称。
    """
    if not program or not bins:
        return
    from app.models.program_bin_name import ProgramBinName
    from sqlalchemy import and_

    saved = 0
    for bin_num, bin_info in bins.items():
        bin_name = bin_info['name'] if isinstance(bin_info, dict) else bin_info
        if not bin_name or not str(bin_name).strip():
            continue
        rec = db.query(ProgramBinName).filter(
            and_(
                ProgramBinName.program == program,
                ProgramBinName.bin_number == int(bin_num)
            )
        ).first()
        if rec:
            rec.bin_name = str(bin_name).strip()
        else:
            db.add(ProgramBinName(
                program=program,
                bin_number=int(bin_num),
                bin_name=str(bin_name).strip()
            ))
        saved += 1
    db.commit()
    print(f"[save_program_bin_names] Saved {saved} bin names for program={program!r}")


def apply_summary_to_csv(db: Session, csv_lot_id: int, summary_data: dict):
    """
    把解析 Summary 文件得到的信息，补充合并到 CSV 的 Lot 数据以及 BinSummary 中。
    注意：CSV 数据中的时间（Test Time start-end）优先级高于 Summary，
    若 Lot 已有 beginning_time / ending_time 则不覆盖。
    """
    from app.models.lot import Lot
    from app.models.bin_summary import BinSummary

    csv_lot = db.query(Lot).filter(Lot.id == csv_lot_id).first()
    if not csv_lot:
        return

    # 1. 补充时间信息（只在 Lot 未有对应时间时才覆盖，保证 CSV 数据优先）
    if summary_data.get('beginning_time') and not csv_lot.beginning_time:
        csv_lot.beginning_time = summary_data['beginning_time']
        if not csv_lot.test_date:
            csv_lot.test_date = summary_data['beginning_time']
    if summary_data.get('ending_time') and not csv_lot.ending_time:
        csv_lot.ending_time = summary_data['ending_time']

    # 1.2 匹配的产品名 (Device Name)，不覆盖 CSV 的 Program 程序名
    if summary_data.get('program'):
        prefix = summary_data['program'].split('_')[0]
        from app.models.product_mapping import ProductMapping
        mapping = db.query(ProductMapping).filter(
            ProductMapping.program_prefix == prefix
        ).first()
        if mapping:
            csv_lot.product_name = mapping.product_name

    # 1.5 补充 Tester / Probe Card 信息到 mp_tester 和 probecard
    if summary_data.get('tester') and not csv_lot.mp_tester:
        csv_lot.mp_tester = summary_data['tester']
    if summary_data.get('probecard') and not csv_lot.probecard:
        csv_lot.probecard = summary_data['probecard']

    # 2. 补充 / 更新分Bin信息 (bin_name)
    bins = summary_data.get('bins', {})
    for bin_num, bin_info in bins.items():
        bin_name = bin_info['name'] if isinstance(bin_info, dict) else bin_info
        if bin_name:
            # 更新已有的 BinSummary 记录的 bin_name
            db.query(BinSummary).filter(
                BinSummary.lot_id == csv_lot_id,
                BinSummary.bin_number == bin_num
            ).update({BinSummary.bin_name: bin_name})

    db.commit()
    print(f"[apply_summary] Updated lot_id={csv_lot_id}: "
          f"beginning={summary_data.get('beginning_time')}, ending={summary_data.get('ending_time')}, "
          f"bins updated={len(bins)}")

