from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

class LotResponse(BaseModel):
    id: int
    filename: str
    product_name: Optional[str]
    lot_id: Optional[str]
    wafer_id: Optional[str]
    program: Optional[str]
    test_machine: Optional[str]
    data_type: Optional[str]
    test_stage: Optional[str]
    station_count: Optional[int]
    die_count: Optional[int]
    pass_count: Optional[int]
    fail_count: Optional[int]
    yield_rate: Optional[float]
    status: Optional[str]
    file_size: Optional[int]
    test_date: Optional[datetime]
    upload_date: Optional[datetime]
    beginning_time: Optional[datetime]
    ending_time: Optional[datetime]
    finish_date: Optional[datetime]
    data_source: Optional[str]
    item_count: Optional[int]
    osat_name: Optional[str] = None    # OSAT 来源（FTP上传时有值，手动上传为 None）
    mp_tester: Optional[str] = None    # 机台编号（后续通过 Summary 关联）
    probecard: Optional[str] = None    # 探针卡（后续通过 Summary 关联）
    ftp_path: Optional[str] = None
    check_status: Optional[str] = None

    class Config:
        from_attributes = True


class LotListResponse(BaseModel):
    total: int
    page: int
    page_size: int
    items: List[LotResponse]