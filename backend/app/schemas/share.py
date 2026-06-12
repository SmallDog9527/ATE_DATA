from pydantic import BaseModel
from datetime import datetime
from typing import Optional


class ShareCreate(BaseModel):
    lot_id: int
    shared_to_username: str   # 搜索用户名来分享
    message: Optional[str] = None


class ShareResponse(BaseModel):
    id: int
    lot_id: int
    lot_filename: str
    shared_by_username: str
    shared_to_username: str
    expires_at: datetime
    created_at: datetime
    message: Optional[str] = None

    class Config:
        from_attributes = True
