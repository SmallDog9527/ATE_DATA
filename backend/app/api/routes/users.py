"""
Admin 用户管理 API
所有接口均需要 Admin 权限，除了 /users/search（登录即可，用于分享时搜索用户）
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List

from app.core.database import get_db
from app.core.security import get_password_hash
from app.models.user import User
from app.models.lot import Lot
from app.schemas.user import UserResponse, UserListItem, AdminResetPasswordRequest
from app.api.deps import get_current_user, require_admin

router = APIRouter(prefix="/users", tags=["users"])


# ──────────────────────────────────────────
# 搜索用户（登录即可，用于分享时查找接收者）
# ──────────────────────────────────────────
@router.get("/search", response_model=List[UserResponse])
def search_users(
    q: str = Query(..., min_length=1),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """模糊搜索用户名或邮箱，排除自己，最多返回10条"""
    results = (
        db.query(User)
        .filter(
            User.id != current_user.id,
            User.is_active == True,
            (User.username.ilike(f"%{q}%") | User.email.ilike(f"%{q}%")),
        )
        .limit(10)
        .all()
    )
    return results


# ──────────────────────────────────────────
# 获取所有用户列表（Admin）
# ──────────────────────────────────────────
@router.get("", response_model=List[UserListItem])
def list_users(
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    users = db.query(User).order_by(User.created_at.desc()).all()
    result = []
    for u in users:
        lot_count = db.query(Lot).filter(Lot.user_id == u.id).count()
        item = UserListItem(
            id=u.id,
            username=u.username,
            email=u.email,
            role=u.role,
            is_active=u.is_active,
            email_verified=u.email_verified,
            created_at=u.created_at,
            last_login_at=u.last_login_at,
            storage_used_bytes=u.storage_used_bytes or 0,
            lot_count=lot_count,
        )
        result.append(item)
    return result


# ──────────────────────────────────────────
# 启用 / 禁用用户（Admin）
# ──────────────────────────────────────────
@router.put("/{user_id}/toggle-active")
def toggle_active(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    if user.id == current_user.id:
        raise HTTPException(status_code=400, detail="不能禁用自己的账号")
    user.is_active = not user.is_active
    db.commit()
    return {"id": user.id, "is_active": user.is_active}


# ──────────────────────────────────────────
# 修改用户角色 (Admin)
# ──────────────────────────────────────────
@router.put("/{user_id}/role")
def set_role(
    user_id: int,
    role: str = Query(..., description="admin, eng, or user"),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    if role not in ["admin", "eng", "user"]:
        raise HTTPException(status_code=400, detail="无效的角色")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    if user.id == current_user.id:
        raise HTTPException(status_code=400, detail="不能修改自己的角色")
    user.role = role
    db.commit()
    return {"id": user.id, "role": user.role}


# ──────────────────────────────────────────
# Admin 直接重置用户密码
# ──────────────────────────────────────────
@router.put("/{user_id}/reset-password")
def admin_reset_password(
    user_id: int,
    body: AdminResetPasswordRequest,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    user.hashed_password = get_password_hash(body.new_password)
    db.commit()
    return {"message": f"用户 {user.username} 的密码已重置"}
