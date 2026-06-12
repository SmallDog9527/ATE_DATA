from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

class IdleCheckConfigBase(BaseModel):
    program_name: str
    params: List[str]
    threshold: int = 2

class IdleCheckConfigCreate(IdleCheckConfigBase):
    pass

class IdleCheckConfig(IdleCheckConfigBase):
    id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
