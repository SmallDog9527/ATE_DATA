"""
User action log service for recording manual audit activities.
"""
from typing import Optional
from fastapi import Request
from sqlalchemy.orm import Session
from app.core.ip_utils import extract_client_ip
from app.models.user import User
from app.models.user_log import UserLog


def record_user_log(
    db: Session,
    action: str,
    target_type: str,
    target_name: Optional[str] = None,
    user: Optional[User] = None,
    user_id: Optional[int] = None,
    username: Optional[str] = None,
    ip_address: Optional[str] = None,
    detail: Optional[str] = None,
    request: Optional[Request] = None,
) -> Optional[UserLog]:
    """
    Record a manual user action log entry into the database.
    All comments, details, and errors must remain strictly in English.
    """
    try:
        # Resolve user identifier and username
        resolved_user_id = user.id if user else user_id
        resolved_username = user.username if user else username

        # Resolve client IP address accurately
        resolved_ip = ip_address
        if not resolved_ip and request:
            try:
                resolved_ip = extract_client_ip(request)
            except Exception as ip_err:
                print(f"[UserLog] Warning: Unable to extract client IP: {ip_err}")

        log_entry = UserLog(
            user_id=resolved_user_id,
            username=resolved_username,
            action=action.upper(),
            target_type=target_type.upper(),
            target_name=target_name,
            detail=detail,
            ip_address=resolved_ip,
        )
        db.add(log_entry)
        db.commit()
        return log_entry
    except Exception as e:
        db.rollback()
        print(f"[UserLog] Error recording user action log: {e}")
        return None
