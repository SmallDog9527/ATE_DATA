"""
Authentication dependency: Resolves current user from Authorization: Bearer <token>.
"""
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.security import decode_token
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
        detail="???? Token ???",
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

    # Extract client IP address
    client_ip = request.headers.get("X-Forwarded-For") or request.headers.get("X-Real-IP") or (request.client.host if request.client else None)
    if client_ip and "," in client_ip:
        client_ip = client_ip.split(",")[0].strip()

    # Record daily active user in Redis
    record_user_activity(user.id, client_ip)

    return user


def require_admin(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role != 'admin':
        raise HTTPException(status_code=403, detail="???????")
    return current_user


def require_admin_or_eng(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role not in ('admin', 'eng'):
        raise HTTPException(status_code=403, detail="????????????????")
    return current_user
