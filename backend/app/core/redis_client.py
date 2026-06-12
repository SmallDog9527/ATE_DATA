import redis
from app.core.config import settings

# 解析 REDIS_URL 创建同步 Redis 客户端
_redis_client: redis.Redis | None = None

def get_redis() -> redis.Redis:
    global _redis_client
    if _redis_client is None:
        _redis_client = redis.from_url(
            settings.REDIS_URL,
            decode_responses=True,
            socket_connect_timeout=5,
        )
    return _redis_client
