from fastapi import APIRouter, Depends, HTTPException, status, Request
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
from app.services.activity import record_user_activity
from app.api.deps import get_current_user

router = APIRouter(prefix="/auth", tags=["auth"])


# ------------------------------------------
# 1. Send registration verify code
# ------------------------------------------
@router.post("/send-verify-code")
def send_code(body: SendVerifyCodeRequest, db: Session = Depends(get_db)):
    if db.query(User).filter(User.username == body.username).first():
        raise HTTPException(status_code=400, detail="??????")
    if db.query(User).filter(User.email == body.email).first():
        raise HTTPException(status_code=400, detail="??????")

    result = send_verify_code(body.email)
    if "error" in result:
        raise HTTPException(status_code=429, detail=result["error"])
    return {"message": "????????????"}


# ------------------------------------------
# 2. Complete registration
# ------------------------------------------
@router.post("/register", response_model=UserResponse)
def register(user_in: UserCreate, db: Session = Depends(get_db)):
    if db.query(User).filter(User.username == user_in.username).first():
        raise HTTPException(status_code=400, detail="??????")
    if db.query(User).filter(User.email == user_in.email).first():
        raise HTTPException(status_code=400, detail="??????")

    if not check_verify_code(user_in.email, user_in.code):
        raise HTTPException(status_code=400, detail="?????????")

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


# ------------------------------------------
# 3. User Login
# ------------------------------------------
@router.post("/login", response_model=Token)
def login(user_in: UserLogin, request: Request, db: Session = Depends(get_db)):
    # Authenticate user credentials without attempt locking (allow unlimited retries on failure)
    user = db.query(User).filter(User.username == user_in.username).first()
    if not user or not verify_password(user_in.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="????????????"
        )

    if not user.is_active:
        raise HTTPException(status_code=400, detail="?????????????")

    # Extract client IP address
    client_ip = request.headers.get("X-Forwarded-For") or request.headers.get("X-Real-IP") or (request.client.host if request.client else None)
    if client_ip and "," in client_ip:
        client_ip = client_ip.split(",")[0].strip()

    # Update last login time and IP address in database
    user.last_login_at = datetime.now(timezone.utc)
    user.last_login_ip = client_ip
    db.commit()

    # Record daily active user in Redis
    record_user_activity(user.id, client_ip)

    access_token  = create_access_token({"sub": str(user.id)})
    refresh_token = create_refresh_token(user.id)

    return {
        "access_token":  access_token,
        "refresh_token": refresh_token,
        "token_type":    "bearer",
        "user":          user,
    }


# ------------------------------------------
# 4. Refresh Access Token
# ------------------------------------------
@router.post("/refresh", response_model=Token)
def refresh_token(body: RefreshRequest, request: Request, db: Session = Depends(get_db)):
    user_id = verify_refresh_token(body.refresh_token)
    if not user_id:
        raise HTTPException(status_code=401, detail="Refresh Token ????????????")

    user = db.query(User).filter(User.id == user_id).first()
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="?????????")

    # Revoke old refresh token and generate new one
    revoke_refresh_token(body.refresh_token)
    access_token  = create_access_token({"sub": str(user.id)})
    new_refresh   = create_refresh_token(user.id)

    # Extract client IP address and record activity in Redis
    client_ip = request.headers.get("X-Forwarded-For") or request.headers.get("X-Real-IP") or (request.client.host if request.client else None)
    if client_ip and "," in client_ip:
        client_ip = client_ip.split(",")[0].strip()
    record_user_activity(user.id, client_ip)

    return {
        "access_token":  access_token,
        "refresh_token": new_refresh,
        "token_type":    "bearer",
        "user":          user,
    }


# ------------------------------------------
# 5. Get current user
# ------------------------------------------
@router.get("/me", response_model=UserResponse)
def get_me(current_user: User = Depends(get_current_user)):
    return current_user


# ------------------------------------------
# 6. Logout
# ------------------------------------------
@router.post("/logout")
def logout(body: RefreshRequest):
    revoke_refresh_token(body.refresh_token)
    return {"message": "?????"}


# ------------------------------------------
# 7. Forgot password
# ------------------------------------------
@router.post("/forgot-password")
def forgot_password(body: ForgotPasswordRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == body.email).first()
    if not user:
        raise HTTPException(status_code=400, detail="????????")

    if not user.is_active:
        raise HTTPException(status_code=400, detail="?????????????")

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
        raise HTTPException(status_code=500, detail=f"??????: {e}")

    return {"message": "????????????????????"}


# ------------------------------------------
# 8. Reset password
# ------------------------------------------
@router.post("/reset-password")
def reset_password(body: ResetPasswordRequest, db: Session = Depends(get_db)):
    user_id = verify_reset_token(body.token)
    if not user_id:
        raise HTTPException(status_code=400, detail="??????????")

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="?????")

    user.hashed_password = get_password_hash(body.new_password)
    db.commit()
    return {"message": "???????????"}


# ------------------------------------------
# 9. Change password
# ------------------------------------------
@router.put("/change-password")
def change_password(
    body: ChangePasswordRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not verify_password(body.old_password, current_user.hashed_password):
        raise HTTPException(status_code=400, detail="??????")
    current_user.hashed_password = get_password_hash(body.new_password)
    db.commit()
    return {"message": "???????????"}
