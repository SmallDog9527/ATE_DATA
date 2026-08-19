"""
Admin User Management API Routes
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional

from app.core.database import get_db
from app.core.security import get_password_hash
from app.models.user import User
from app.models.lot import Lot
from app.schemas.user import (
    UserResponse,
    UserListItem,
    AdminResetPasswordRequest,
    AdminCreateUserRequest,
    AdminResetAccountPasswordRequest,
    UserExportItem,
    UserImportItem,
    UserImportResponse,
)
from app.api.deps import get_current_user, require_admin

router = APIRouter(prefix="/users", tags=["users"])


# ──────────────────────────────────────────
# Search users (Logged-in users, for share selection)
# ──────────────────────────────────────────
@router.get("/search", response_model=List[UserResponse])
def search_users(
    q: str = Query(..., min_length=1),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Fuzzy search username or email excluding current user, limit to 10 records."""
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
# Export all users JSON (Admin)
# ──────────────────────────────────────────
@router.get("/export", response_model=List[UserExportItem])
def export_users(
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    """Export all user data into JSON format for backup and recovery."""
    users = db.query(User).order_by(User.id.asc()).all()
    result = []
    for u in users:
        result.append(
            UserExportItem(
                id=u.id,
                username=u.username,
                email=u.email,
                hashed_password=u.hashed_password,
                role=u.role or "user",
                is_active=u.is_active,
                email_verified=u.email_verified,
                receive_alerts=getattr(u, "receive_alerts", False),
                created_at=u.created_at,
            )
        )
    return result


# ──────────────────────────────────────────
# Import users JSON (Admin)
# ──────────────────────────────────────────
@router.post("/import", response_model=UserImportResponse)
def import_users(
    items: List[UserImportItem],
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    """Import user records into database based on database ID or username/email."""
    created_count = 0
    updated_count = 0
    errors = []

    for idx, item in enumerate(items):
        try:
            user = None
            if item.id is not None:
                user = db.query(User).filter(User.id == item.id).first()
            if not user:
                user = db.query(User).filter((User.username == item.username) | (User.email == item.email)).first()

            if user:
                user.username = item.username
                user.email = item.email
                if item.role:
                    user.role = item.role
                if item.is_active is not None:
                    user.is_active = item.is_active
                if item.email_verified is not None:
                    user.email_verified = item.email_verified
                if item.receive_alerts is not None:
                    user.receive_alerts = item.receive_alerts
                if item.hashed_password:
                    user.hashed_password = item.hashed_password
                elif item.password:
                    user.hashed_password = get_password_hash(item.password)
                updated_count += 1
            else:
                pwd_hash = item.hashed_password or (
                    get_password_hash(item.password) if item.password else get_password_hash("12345678")
                )
                new_user = User(
                    username=item.username,
                    email=item.email,
                    hashed_password=pwd_hash,
                    role=item.role or "user",
                    is_active=item.is_active if item.is_active is not None else True,
                    email_verified=item.email_verified if item.email_verified is not None else True,
                    receive_alerts=item.receive_alerts if item.receive_alerts is not None else False,
                )
                if item.id is not None:
                    new_user.id = item.id
                db.add(new_user)
                created_count += 1
            db.commit()
        except Exception as e:
            db.rollback()
            errors.append(f"Row {idx+1} ({item.username}): {str(e)}")

    # Update PostgreSQL ID sequence if necessary
    try:
        from sqlalchemy import text
        db.execute(text("SELECT setval('users_id_seq', (SELECT COALESCE(MAX(id), 1) FROM users));"))
        db.commit()
    except Exception:
        db.rollback()

    return UserImportResponse(
        imported_count=len(items),
        created_count=created_count,
        updated_count=updated_count,
        errors=errors,
    )


# ──────────────────────────────────────────
# Admin create new user directly
# ──────────────────────────────────────────
@router.post("/create", response_model=UserListItem)
def create_user(
    body: AdminCreateUserRequest,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    """Admin creates a new user directly."""
    if db.query(User).filter(User.username == body.username).first():
        raise HTTPException(status_code=400, detail="Username already exists")
    if db.query(User).filter(User.email == body.email).first():
        raise HTTPException(status_code=400, detail="Email already registered")

    user = User(
        username=body.username,
        email=body.email,
        hashed_password=get_password_hash(body.password),
        role=body.role or "user",
        is_active=True,
        email_verified=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    lot_count = db.query(Lot).filter(Lot.user_id == user.id).count()
    return UserListItem(
        id=user.id,
        username=user.username,
        email=user.email,
        role=user.role,
        is_active=user.is_active,
        email_verified=user.email_verified,
        created_at=user.created_at,
        last_login_at=user.last_login_at,
        last_login_ip=getattr(user, "last_login_ip", None),
        storage_used_bytes=user.storage_used_bytes or 0,
        receive_alerts=getattr(user, "receive_alerts", False),
        lot_count=lot_count,
    )


# ──────────────────────────────────────────
# Get all users list (Admin)
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
            last_login_ip=getattr(u, "last_login_ip", None),
            storage_used_bytes=u.storage_used_bytes or 0,
            receive_alerts=getattr(u, "receive_alerts", False),
            lot_count=lot_count,
        )
        result.append(item)
    return result


# ──────────────────────────────────────────
# Toggle user active status (Admin)
# ──────────────────────────────────────────
@router.put("/{user_id}/toggle-active")
def toggle_active(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot disable your own account")
    user.is_active = not user.is_active
    db.commit()
    return {"id": user.id, "is_active": user.is_active}


# ──────────────────────────────────────────
# Set user role (Admin)
# ──────────────────────────────────────────
@router.put("/{user_id}/role")
def set_role(
    user_id: int,
    role: str = Query(..., description="admin, eng, or user"),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    if role not in ["admin", "eng", "user"]:
        raise HTTPException(status_code=400, detail="Invalid role")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot modify your own role")
    user.role = role
    db.commit()
    return {"id": user.id, "role": user.role}


# ──────────────────────────────────────────
# Admin reset user password only
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
        raise HTTPException(status_code=404, detail="User not found")
    user.hashed_password = get_password_hash(body.new_password)
    db.commit()
    return {"message": f"Password for user {user.username} has been reset"}


# ──────────────────────────────────────────
# Admin reset user account username & password
# ──────────────────────────────────────────
@router.put("/{user_id}/reset-account-password")
def reset_account_and_password(
    user_id: int,
    body: AdminResetAccountPasswordRequest,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    """Admin resets user account username and/or password."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if body.username and body.username != user.username:
        existing = db.query(User).filter(User.username == body.username, User.id != user_id).first()
        if existing:
            raise HTTPException(status_code=400, detail="Username already taken by another user")
        user.username = body.username

    if body.email and body.email != user.email:
        existing_email = db.query(User).filter(User.email == body.email, User.id != user_id).first()
        if existing_email:
            raise HTTPException(status_code=400, detail="Email already registered by another user")
        user.email = body.email

    if body.new_password:
        user.hashed_password = get_password_hash(body.new_password)

    db.commit()
    db.refresh(user)
    return {
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "updated_password": bool(body.new_password),
        "message": f"Account for user ID {user.id} updated successfully",
    }


# ──────────────────────────────────────────
# Toggle user alert subscription (Admin)
# ──────────────────────────────────────────
@router.put("/{user_id}/toggle-alerts")
def toggle_alerts(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.role == "user":
        raise HTTPException(status_code=400, detail="User role cannot receive alert emails")
    user.receive_alerts = not getattr(user, "receive_alerts", False)
    db.commit()
    return {"id": user.id, "receive_alerts": user.receive_alerts}


@router.post("/test-ftp-alert")
def test_ftp_alert(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not getattr(current_user, "receive_alerts", False) or current_user.role not in ("admin", "eng"):
        raise HTTPException(status_code=403, detail="You do not have permission to test alert emails")

    from app.models.system_setting import SystemSetting
    from app.services.smtp_dynamic import send_smtp_auto
    from datetime import datetime

    cfg = db.query(SystemSetting).first()
    if not cfg or not cfg.smtp_user:
        raise HTTPException(status_code=400, detail="SMTP is not configured in the system")

    target_email = current_user.email
    if not target_email:
        raise HTTPException(status_code=400, detail="Your user account does not have an email address")

    subject = "【ATE System】FTP Alert Test Email"
    html = f"""
    <div style="font-family:sans-serif;max-width:600px;margin:auto;border:1px solid #ddd;padding:20px;border-radius:8px">
      <h2 style="color:#d9534f">⚠️ ATE Alert Test</h2>
      <p>This is a test email triggered by user {current_user.username}.</p>
      <hr style="border:0;border-top:1px solid #eee"/>
      <p>Target Email: {target_email}</p>
    </div>
    """
    try:
        send_smtp_auto(db, target_email, subject, html)
        return {"message": f"Test alert email sent successfully to {target_email}"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to send email: {str(e)}")
