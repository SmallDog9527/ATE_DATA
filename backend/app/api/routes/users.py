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
            receive_alerts=getattr(u, "receive_alerts", False),
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

# ??????????????????????????????????????????
# ?? / ???????? (Admin)
# ??????????????????????????????????????????
@router.put("/{user_id}/toggle-alerts")
def toggle_alerts(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="?????")
    if user.role == "user":
        raise HTTPException(status_code=400, detail="????(user)????????")
    user.receive_alerts = not getattr(user, "receive_alerts", False)
    db.commit()
    return {"id": user.id, "receive_alerts": user.receive_alerts}

@router.post("/test-ftp-alert")
def test_ftp_alert(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # 校验用户权限：仅限有订阅的 admin 或 eng
    if not getattr(current_user, "receive_alerts", False) or current_user.role not in ("admin", "eng"):
        raise HTTPException(status_code=403, detail="您没有接收 FTP 报错邮件的权限，无法进行发送测试")
    
    from app.models.system_setting import SystemSetting
    from app.services.smtp_dynamic import send_smtp_auto
    from datetime import datetime
    
    cfg = db.query(SystemSetting).first()
    if not cfg or not cfg.smtp_user:
        raise HTTPException(status_code=400, detail="系统尚未配置邮箱，请先配置 SMTP 邮箱")
        
    # 目的邮箱：当前用户的注册邮箱
    target_email = current_user.email
    if not target_email:
        raise HTTPException(status_code=400, detail="您的账号未配置电子邮箱，无法发送")
        
    subject = "【ATE系统】模拟 FTP 报错测试邮件"
    html = f"""
    <div style="font-family:sans-serif;max-width:600px;margin:auto;border:1px solid #ddd;padding:20px;border-radius:8px">
      <h2 style="color:#d9534f">⚠️ ATE 模拟报错测试</h2>
      <p>这是一封由具有订阅权限的用户（用户名：{current_user.username}）在个人信息页面手动触发的 ATE 系统 FTP 报错模拟测试邮件。</p>
      <hr style="border:0;border-top:1px solid #eee"/>
      <table style="width:100%;border-collapse:collapse">
        <tr>
          <td style="padding:8px 0;color:#666;width:120px">测试项:</td>
          <td style="padding:8px 0;font-weight:bold">手动模拟告警发送</td>
        </tr>
        <tr>
          <td style="padding:8px 0;color:#666">测试文件:</td>
          <td style="padding:8px 0;font-family:monospace;color:#c7254e;background:#f9f2f4;padding:2px 4px;border-radius:4px">test_ftp_file.zip</td>
        </tr>
        <tr>
          <td style="padding:8px 0;color:#666">报错详情:</td>
          <td style="padding:8px 0;color:#d9534f;font-weight:bold">测试模拟：FTP 连接重试次数达到上限</td>
        </tr>
        <tr>
          <td style="padding:8px 0;color:#666">发送时间:</td>
          <td style="padding:8px 0">{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;color:#666">接收邮箱:</td>
          <td style="padding:8px 0;font-weight:bold">{target_email}</td>
        </tr>
      </table>
      <hr style="border:0;border-top:1px solid #eee"/>
      <p style="color:#666;font-size:14px">系统配置验证成功，邮件通道正常。</p>
    </div>
    """
    try:
        send_smtp_auto(db, target_email, subject, html)
        return {"message": f"已成功向您的注册邮箱 {target_email} 发送测试告警邮件，请注意查收"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"邮件发送失败: {str(e)}")
