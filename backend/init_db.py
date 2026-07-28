"""
Initialize default data for Chip ATE Analysis System.
Called automatically on container startup after migrations.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.core.database import SessionLocal
from app.models.user import User
from app.core.security import get_password_hash
from app.core.database import engine, Base
import app.models


def create_default_admin():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        # Check if any user exists
        user_count = db.query(User).count()
        if user_count > 0:
            print("[init_db] Users already exist, skipping default admin creation.")
            return

        # Create default admin user
        admin_username = os.getenv("DEFAULT_ADMIN_USERNAME", "admin")
        admin_password = os.getenv("DEFAULT_ADMIN_PASSWORD", "admin123")
        # Fetch default admin email from system settings if available
        from app.models.system_setting import SystemSetting
        sys_cfg = db.query(SystemSetting).first()
        default_email = (sys_cfg.smtp_from or sys_cfg.smtp_user) if (sys_cfg and (sys_cfg.smtp_from or sys_cfg.smtp_user)) else "53547326@qq.com"
        admin_email = os.getenv("DEFAULT_ADMIN_EMAIL", default_email)

        admin = User(
            username=admin_username,
            email=admin_email,
            hashed_password=get_password_hash(admin_password),
            is_active=True,
            role="admin",
        )
        db.add(admin)
        db.commit()
        db.refresh(admin)
        print(f"[init_db] Default admin user created: {admin_username} / {admin_password}")
        print("[init_db] !!! Please change the default password after first login !!!")
    except Exception as e:
        print(f"[init_db] Error: {e}")
        db.rollback()
    finally:
        db.close()


if __name__ == "__main__":
    create_default_admin()
