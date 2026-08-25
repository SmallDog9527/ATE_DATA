from pydantic import BaseModel
from datetime import datetime
from typing import Optional, Any

class ReportCreate(BaseModel):
    name: str
    product_name: Optional[str] = None
    url: str
    type: str = "Multi-Bin Analysis"
    source: str = "eng"
    comment: Optional[str] = None
    config_data: Optional[Any] = None

class ReportUpdate(BaseModel):
    name: Optional[str] = None
    product_name: Optional[str] = None
    url: Optional[str] = None
    comment: Optional[str] = None
    config_data: Optional[Any] = None

class ReportResponse(BaseModel):
    id: int
    name: str
    product_name: Optional[str] = None
    url: str
    type: str
    source: str
    comment: Optional[str] = None
    config_data: Optional[Any] = None
    user_id: int
    username: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
