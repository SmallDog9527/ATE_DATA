"""
Activity service for recording and retrieving daily active users using Redis.
"""
import json
from datetime import datetime
from typing import Optional, List, Dict, Any
from zoneinfo import ZoneInfo
from sqlalchemy.orm import Session

from app.core.redis_client import get_redis
from app.models.user import User


def record_user_activity(user_id: int, ip: Optional[str] = None) -> None:
    """
    Record user daily active state into Redis.
    Uses Redis Set for unique active user IDs and Redis Hash for detailed activity info.
    """
    try:
        r = get_redis()
        sh_now = datetime.now(ZoneInfo("Asia/Shanghai"))
        today_str = sh_now.strftime("%Y-%m-%d")
        now_str = sh_now.strftime("%Y-%m-%d %H:%M:%S")

        set_key = f"active_users:{today_str}"
        detail_key = f"active_users_detail:{today_str}"

        # 1. Add user ID to daily active Set
        r.sadd(set_key, user_id)
        r.expire(set_key, 86400 * 30)

        # 2. Update user latest active timestamp and IP in Hash
        detail_val = json.dumps({
            "last_active_at": now_str,
            "ip": ip or "",
        })
        r.hset(detail_key, str(user_id), detail_val)
        r.expire(detail_key, 86400 * 30)
    except Exception as e:
        # Silently catch to avoid disrupting API request flow
        print(f"[Activity] Warning: Failed to record user activity: {e}")


def get_daily_active_users(target_date: Optional[str] = None, db: Optional[Session] = None) -> Dict[str, Any]:
    """
    Retrieve active users count and user details for a given date (defaults to today).
    """
    try:
        r = get_redis()
        if not target_date:
            target_date = datetime.now(ZoneInfo("Asia/Shanghai")).strftime("%Y-%m-%d")

        set_key = f"active_users:{target_date}"
        detail_key = f"active_users_detail:{target_date}"

        user_ids = [int(uid) for uid in r.smembers(set_key) if uid]
        details_raw = r.hgetall(detail_key) or {}

        details_map = {}
        for uid_str, raw_json in details_raw.items():
            try:
                details_map[int(uid_str)] = json.loads(raw_json)
            except Exception:
                details_map[int(uid_str)] = {"last_active_at": None, "ip": ""}

        users_list: List[Dict[str, Any]] = []
        if db and user_ids:
            db_users = db.query(User).filter(User.id.in_(user_ids)).all()
            for u in db_users:
                det = details_map.get(u.id, {})
                users_list.append({
                    "id": u.id,
                    "username": u.username,
                    "email": u.email,
                    "role": u.role,
                    "is_active": u.is_active,
                    "last_active_at": det.get("last_active_at"),
                    "last_active_ip": det.get("ip"),
                    "last_login_at": u.last_login_at,
                    "last_login_ip": getattr(u, "last_login_ip", None),
                })
        else:
            for uid in user_ids:
                det = details_map.get(uid, {})
                users_list.append({
                    "id": uid,
                    "last_active_at": det.get("last_active_at"),
                    "last_active_ip": det.get("ip"),
                })

        # Sort by latest active time descending
        users_list.sort(key=lambda x: x.get("last_active_at") or "", reverse=True)

        return {
            "date": target_date,
            "count": len(user_ids),
            "users": users_list,
        }
    except Exception as e:
        print(f"[Activity] Error fetching daily active users: {e}")
        return {
            "date": target_date or "",
            "count": 0,
            "users": [],
            "error": str(e),
        }
