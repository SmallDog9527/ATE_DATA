from fastapi import APIRouter, Depends, HTTPException, status, Request, Request
from sqlalchemy.orm import Session
from datetime import datetime, timezone

from app.core.database import get_db
from app.core.security import (
    verify_password, get_password_hash,
    create_access_token, create_refresh_token,
    verify_refresh_token, revoke_refresh_token,
    generate_reset_token,
)
from app.models.user import User
from app.schemas.user import (
    SendVerifyCodeRequest, UserCreate, UserLogin,
    ForgotPasswordRequest, ResetPasswordRequest,
    ChangePasswordRequest, Token, RefreshRequest, UserResponse,
)
from app.services.email import (
    send_verify_code, check_verify_code,
    send_reset_link, store_reset_token, verify_reset_token,
    is_login_locked, record_login_fail, clear_login_fail,
)
from app.api.deps import get_current_user

router = APIRouter(prefix="/auth", tags=["auth"])


# ──────────────────────────────────────────
# 1. 发送注册验证码
# ──────────────────────────────────────────
@router.post("/send-verify-code")
def send_code(body: SendVerifyCodeRequest, db: Session = Depends(get_db)):
    # 预检：用户名 / 邮箱是否已存在
    if db.query(User).filter(User.username == body.username).first():
        raise HTTPException(status_code=400, detail="用户名已存在")
    if db.query(User).filter(User.email == body.email).first():
        raise HTTPException(status_code=400, detail="邮箱已被注册")

    result = send_verify_code(body.email)
    if "error" in result:
        raise HTTPException(status_code=429, detail=result["error"])
    return {"message": "验证码已发送，请查收邮件"}


# ──────────────────────────────────────────
# 2. 完成注册
# ──────────────────────────────────────────
@router.post("/register", response_model=UserResponse)
def register(user_in: UserCreate, db: Session = Depends(get_db)):
    # 再次校验（防止并发）
    if db.query(User).filter(User.username == user_in.username).first():
        raise HTTPException(status_code=400, detail="用户名已存在")
    if db.query(User).filter(User.email == user_in.email).first():
        raise HTTPException(status_code=400, detail="邮箱已被注册")

    # 验证码校验
    if not check_verify_code(user_in.email, user_in.code):
        raise HTTPException(status_code=400, detail="验证码错误或已过期")

    user = User(
        username=user_in.username,
        email=user_in.email,
        hashed_password=get_password_hash(user_in.password),
        email_verified=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


# ──────────────────────────────────────────
# 3. 登录
# ──────────────────────────────────────────
@router.post("/login", response_model=Token)
def login(user_in: UserLogin, request: Request, db: Session = Depends(get_db)):
    # Authenticate user credentials without attempt locking (allow unlimited retries on failure)
    user = db.query(User).filter(User.username == user_in.username).first()
    if not user or not verify_password(user_in.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="用户名或密码错误，请重试"
        )

    if not user.is_active:
        raise HTTPException(status_code=400, detail="账号已被禁用，请联系管理员")

    # Extract client IP address
    client_ip = request.headers.get("X-Forwarded-For") or request.headers.get("X-Real-IP") or (request.client.host if request.client else None)
    if client_ip and "," in client_ip:
        client_ip = client_ip.split(",")[0].strip()

    # Update last login time and IP address
    user.last_login_at = datetime.now(timezone.utc)
    user.last_login_ip = client_ip
    db.commit()

    access_token  = create_access_token({"sub": str(user.id)})
    refresh_token = create_refresh_token(user.id)

    return {
        "access_token":  access_token,
        "refresh_token": refresh_token,
        "token_type":    "bearer",
        "user":          user,
    }


# ──────────────────────────────────────────
# 4. 刷新 Access Token
# ──────────────────────────────────────────
@router.post("/refresh", response_model=Token)
def refresh_token(body: RefreshRequest, db: Session = Depends(get_db)):
    user_id = verify_refresh_token(body.refresh_token)
    if not user_id:
        raise HTTPException(status_code=401, detail="Refresh Token 无效或已过期，请重新登录")

    user = db.query(User).filter(User.id == user_id).first()
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="用户不存在或已禁用")

    # 旧 token 撤销，发新的
    revoke_refresh_token(body.refresh_token)
    access_token  = create_access_token({"sub": str(user.id)})
    new_refresh   = create_refresh_token(user.id)

    return {
        "access_token":  access_token,
        "refresh_token": new_refresh,
        "token_type":    "bearer",
        "user":          user,
    }


# ──────────────────────────────────────────
# 5. 获取当前用户
# ──────────────────────────────────────────
@router.get("/me", response_model=UserResponse)
def get_me(current_user: User = Depends(get_current_user)):
    return current_user


# ──────────────────────────────────────────
# 6. 退出登录（撤销 Refresh Token）
# ──────────────────────────────────────────
@router.post("/logout")
def logout(body: RefreshRequest):
    revoke_refresh_token(body.refresh_token)
    return {"message": "已退出登录"}


# ──────────────────────────────────────────
# 7. 忘记密码 → 发重置邮件
# ──────────────────────────────────────────
@router.post("/forgot-password")
def forgot_password(body: ForgotPasswordRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == body.email).first()
    if not user:
        raise HTTPException(status_code=400, detail="无此邮箱，请注册")

    if not user.is_active:
        raise HTTPException(status_code=400, detail="账号已被禁用，请联系管理员")

    import random, string
    chars = string.ascii_letters + string.digits
    new_password = "".join(random.choices(chars, k=12))

    user.hashed_password = get_password_hash(new_password)
    db.commit()

    try:
        from app.services.email import send_username_and_password_email
        send_username_and_password_email(body.email, user.username, new_password)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"邮件发送失败: {e}")

    return {"message": "账号与新随机密码已发送至您的邮箱，请查收"}


# ──────────────────────────────────────────
# 8. 重置密码（通过邮件链接中的 token）
# ──────────────────────────────────────────
@router.post("/reset-password")
def reset_password(body: ResetPasswordRequest, db: Session = Depends(get_db)):
    user_id = verify_reset_token(body.token)
    if not user_id:
        raise HTTPException(status_code=400, detail="重置链接无效或已过期")

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")

    user.hashed_password = get_password_hash(body.new_password)
    db.commit()
    return {"message": "密码已重置，请重新登录"}


# ──────────────────────────────────────────
# 9. 修改密码（已登录，需验旧密码）
# ──────────────────────────────────────────
@router.put("/change-password")
def change_password(
    body: ChangePasswordRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not verify_password(body.old_password, current_user.hashed_password):
        raise HTTPException(status_code=400, detail="当前密码错误")
    current_user.hashed_password = get_password_hash(body.new_password)
    db.commit()
    return {"message": "密码已修改，请重新登录"}