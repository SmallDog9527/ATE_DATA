from datetime import datetime, timezone
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.security import decode_token
from app.core.ip_utils import extract_client_ip
from app.models.user import User
from app.services.activity import record_user_activity

bearer_scheme = HTTPBearer(auto_error=False)


def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired access token",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if not credentials:
        raise exc
    payload = decode_token(credentials.credentials)
    if not payload or payload.get("type") != "access":
        raise exc
    user = db.query(User).filter(User.id == int(payload["sub"])).first()
    if not user or not user.is_active:
        raise exc

    # Extract client IP address accurately
    client_ip = extract_client_ip(request)

    # Record daily active user state in Redis
    record_user_activity(user.id, client_ip)

    # Update latest user interaction timestamp and client IP with 20-second throttling
    now_utc = datetime.now(timezone.utc)
    should_update_db = False
    if not user.last_login_at:
        should_update_db = True
    else:
        last_at = user.last_login_at
        if last_at.tzinfo is None:
            last_at = last_at.replace(tzinfo=timezone.utc)
        elapsed = (now_utc - last_at).total_seconds()
        if elapsed >= 20 or (client_ip and client_ip != user.last_login_ip):
            should_update_db = True

    if should_update_db:
        try:
            user.last_login_at = now_utc
            if client_ip:
                user.last_login_ip = client_ip
            db.commit()
        except Exception:
            db.rollback()

    return user


def require_admin(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role != 'admin':
        raise HTTPException(status_code=403, detail="Admin permission required")
    return current_user


def require_admin_or_eng(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role not in ('admin', 'eng'):
        raise HTTPException(status_code=403, detail="Admin or Engineer permission required")
    return current_user

