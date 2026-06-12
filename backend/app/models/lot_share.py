from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from sqlalchemy.sql import func
from app.core.database import Base

class LotShare(Base):
    __tablename__ = "lot_shares"

    id           = Column(Integer, primary_key=True, index=True)
    lot_id       = Column(Integer, ForeignKey("lots.id", ondelete="CASCADE"), nullable=False, index=True)
    shared_by    = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    shared_to    = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    expires_at   = Column(DateTime, nullable=False)   # 7天后过期
    created_at   = Column(DateTime, server_default=func.now())
    message      = Column(String)                     # 可选留言
