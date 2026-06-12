"""运行此脚本以应用数据库迁移（安全：只加字段/表，不删数据）"""
import sys
sys.path.insert(0, '/app')

from app.core.database import Base, engine
from app.models import *   # noqa: ensure all models are registered
import sqlalchemy as sa

inspector = sa.inspect(engine)
existing_tables = inspector.get_table_names()
print(f"Existing tables: {existing_tables}")

# 1. 给 users 表加新列
if 'users' in existing_tables:
    cols = [c['name'] for c in inspector.get_columns('users')]
    with engine.begin() as conn:
        if 'email_verified' not in cols:
            conn.execute(sa.text('ALTER TABLE users ADD COLUMN email_verified BOOLEAN NOT NULL DEFAULT FALSE'))
            print('[OK] Added column: email_verified')
        else:
            print('[SKIP] email_verified already exists')

        if 'last_login_at' not in cols:
            conn.execute(sa.text('ALTER TABLE users ADD COLUMN last_login_at TIMESTAMP'))
            print('[OK] Added column: last_login_at')
        else:
            print('[SKIP] last_login_at already exists')
else:
    print('[WARN] users table not found')

# 2. 创建 lot_shares 表（如果不存在）
if 'lot_shares' not in existing_tables:
    Base.metadata.tables['lot_shares'].create(engine)
    print('[OK] Created table: lot_shares')
else:
    print('[SKIP] lot_shares already exists')

print('\nMigration complete!')
