from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime, timedelta, timezone
from typing import List

from app.core.database import get_db
from app.models.lot import Lot
from app.models.lot_share import LotShare
from app.models.user import User
from app.schemas.share import ShareCreate, ShareResponse
from app.api.deps import get_current_user

router = APIRouter(prefix="/shares", tags=["shares"])

SHARE_EXPIRE_DAYS = 7


def _build_response(share: LotShare, db: Session) -> dict:
    lot       = db.query(Lot).filter(Lot.id == share.lot_id).first()
    sharer    = db.query(User).filter(User.id == share.shared_by).first()
    recipient = db.query(User).filter(User.id == share.shared_to).first()
    return {
        "id":                share.id,
        "lot_id":            share.lot_id,
        "lot_filename":      lot.filename if lot else "(已删除)",
        "shared_by_username": sharer.username if sharer else "(已删除)",
        "shared_to_username": recipient.username if recipient else "(已删除)",
        "expires_at":        share.expires_at,
        "created_at":        share.created_at,
        "message":           share.message,
    }


# ──────────────────────────────────────────
# 创建分享
# ──────────────────────────────────────────
@router.post("", response_model=ShareResponse)
def create_share(
    body: ShareCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # 校验 lot 存在且属于当前用户（或 admin）
    lot = db.query(Lot).filter(Lot.id == body.lot_id).first()
    if not lot:
        raise HTTPException(status_code=404, detail="Lot 不存在")
    if current_user.role != 'admin' and lot.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="无权分享此 Lot")

    # 找接收用户
    recipient = db.query(User).filter(User.username == body.shared_to_username).first()
    if not recipient:
        raise HTTPException(status_code=404, detail=f"用户 '{body.shared_to_username}' 不存在")
    if recipient.id == current_user.id:
        raise HTTPException(status_code=400, detail="不能分享给自己")

    # 检查是否已经分享过（且未过期）
    existing = (
        db.query(LotShare)
        .filter(
            LotShare.lot_id    == body.lot_id,
            LotShare.shared_by == current_user.id,
            LotShare.shared_to == recipient.id,
            LotShare.expires_at > datetime.now(timezone.utc),
        )
        .first()
    )
    if existing:
        raise HTTPException(status_code=400, detail="该 Lot 已分享给此用户且尚未过期")

    share = LotShare(
        lot_id     = body.lot_id,
        shared_by  = current_user.id,
        shared_to  = recipient.id,
        expires_at = datetime.now(timezone.utc) + timedelta(days=SHARE_EXPIRE_DAYS),
        message    = body.message,
    )
    db.add(share)
    db.commit()
    db.refresh(share)
    return _build_response(share, db)


# ──────────────────────────────────────────
# 分享给我的
# ──────────────────────────────────────────
@router.get("/received", response_model=List[ShareResponse])
def get_received(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    now = datetime.now(timezone.utc)
    shares = (
        db.query(LotShare)
        .filter(LotShare.shared_to == current_user.id, LotShare.expires_at > now)
        .order_by(LotShare.created_at.desc())
        .all()
    )
    return [_build_response(s, db) for s in shares]


# ──────────────────────────────────────────
# 我分享出去的
# ──────────────────────────────────────────
@router.get("/sent", response_model=List[ShareResponse])
def get_sent(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    shares = (
        db.query(LotShare)
        .filter(LotShare.shared_by == current_user.id)
        .order_by(LotShare.created_at.desc())
        .all()
    )
    return [_build_response(s, db) for s in shares]


# ──────────────────────────────────────────
# 撤销分享
# ──────────────────────────────────────────
@router.delete("/{share_id}")
def revoke_share(
    share_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    share = db.query(LotShare).filter(LotShare.id == share_id).first()
    if not share:
        raise HTTPException(status_code=404, detail="分享记录不存在")
    if share.shared_by != current_user.id and current_user.role != 'admin':
        raise HTTPException(status_code=403, detail="无权撤销此分享")
    db.delete(share)
    db.commit()
    return {"message": "分享已撤销"}
