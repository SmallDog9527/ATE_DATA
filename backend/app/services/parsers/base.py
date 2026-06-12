from dataclasses import dataclass, field
from typing import Optional
import pandas as pd

@dataclass
class ParsedData:
    """统一的解析输出格式"""
    # 元数据
    tester: str = ""
    test_stage: str = ""       # CP/FT/RT/QA
    program: str = ""
    lot_id: str = ""
    wafer_id: str = ""
    handler: str = ""
    mp_tester: str = ""    # 机台编号（留空，后续通过 Summary 关联填入）
    probecard: str = ""    # 探针卡（留空，后续通过 Summary 关联填入）
    beginning_time: Optional[str] = None
    ending_time: Optional[str] = None
    test_date: Optional[str] = None   # 标准化测试日期 'YYYY-MM-DD HH:MM:SS' 或 'YYYY-MM-DD'

    # Bin定义 {bin_number: {"name": str, "hard_bin": int}}
    bin_definitions: dict = field(default_factory=dict)

    # 参数信息
    param_names: list = field(default_factory=list)
    param_units: dict = field(default_factory=dict)
    param_ll: dict = field(default_factory=dict)
    param_ul: dict = field(default_factory=dict)

    # 实际数据 DataFrame
    # 列：SITE_NUM | SOFT_BIN | X_COORD | Y_COORD | param1 | param2 | ...
    data: Optional[pd.DataFrame] = None

    # 错误信息
    error: Optional[str] = None