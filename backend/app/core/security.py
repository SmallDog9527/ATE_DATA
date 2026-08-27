from datetime import datetime, timedelta
from typing import Optional
from jose import JWTError, jwt
from passlib.context import CryptContext
from app.core.config import settings
import secrets

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES  = 120        # 2 hours
REFRESH_TOKEN_EXPIRE_DAYS    = 30         # 30 days
REFRESH_TOKEN_REDIS_PREFIX   = "refresh:"


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password[:72], hashed_password)


def get_password_hash(password: str) -> str:
    return pwd_context.hash(password[:72])


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire, "type": "access"})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token: str) -> Optional[dict]:
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except JWTError:
        return None


# ------------------------------------------
# Refresh Token (Random token + Redis storage)
# ------------------------------------------

def create_refresh_token(user_id: int) -> str:
    """Generate a 30-day valid Refresh Token and store it into Redis."""
    from app.core.redis_client import get_redis
    token = secrets.token_urlsafe(48)
    r = get_redis()
    r.setex(
        f"{REFRESH_TOKEN_REDIS_PREFIX}{token}",
        int(timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS).total_seconds()),
        str(user_id),
    )
    return token


def verify_refresh_token(token: str) -> Optional[int]:
    """Verify Refresh Token and return user_id. Returns None if invalid or expired."""
    from app.core.redis_client import get_redis
    r = get_redis()
    val = r.get(f"{REFRESH_TOKEN_REDIS_PREFIX}{token}")
    return int(val) if val else None


def revoke_refresh_token(token: str):
    """Revoke Refresh Token on logout."""
    from app.core.redis_client import get_redis
    get_redis().delete(f"{REFRESH_TOKEN_REDIS_PREFIX}{token}")


def generate_reset_token() -> str:
    return secrets.token_urlsafe(32)
