import sys
import os

# Add backend to path
sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'backend'))

from sqlalchemy.orm import Session
from app.core.database import SessionLocal
from app.models.user import User
from app.core.security import get_password_hash

def create_user(username, email, password, is_admin=False):
    db = SessionLocal()
    try:
        # Check if exists
        user = db.query(User).filter(User.username == username).first()
        if user:
            print(f"User {username} already exists.")
            return

        user = User(
            username=username,
            email=email,
            hashed_password=get_password_hash(password),
            is_admin=is_admin
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        print(f"User {username} created successfully!")
    except Exception as e:
        print(f"Error: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description='Create a new user')
    parser.add_argument('--username', default='admin', help='Username')
    parser.add_argument('--password', default='admin123', help='Password')
    parser.add_argument('--email', default='admin@example.com', help='Email')
    parser.add_argument('--admin', action='store_true', help='Set as admin')
    args = parser.parse_args()

    create_user(args.username, args.email, args.password, args.admin)
