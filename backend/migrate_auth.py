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

        if 'receive_alerts' not in cols:
            conn.execute(sa.text('ALTER TABLE users ADD COLUMN receive_alerts BOOLEAN NOT NULL DEFAULT FALSE'))
            print('[OK] Added column: receive_alerts')
        else:
            print('[SKIP] receive_alerts already exists')
else:
    print('[WARN] users table not found')

# 2. 给 lots 表加新列
if 'lots' in existing_tables:
    cols = [c['name'] for c in inspector.get_columns('lots')]
    with engine.begin() as conn:
        if 'beginning_time' not in cols:
            conn.execute(sa.text('ALTER TABLE lots ADD COLUMN beginning_time TIMESTAMP'))
            print('[OK] Added column: beginning_time')
        else:
            print('[SKIP] beginning_time already exists')

        if 'ending_time' not in cols:
            conn.execute(sa.text('ALTER TABLE lots ADD COLUMN ending_time TIMESTAMP'))
            print('[OK] Added column: ending_time')
        else:
            print('[SKIP] ending_time already exists')

        if 'ftp_path' not in cols:
            conn.execute(sa.text('ALTER TABLE lots ADD COLUMN ftp_path VARCHAR(1000)'))
            print('[OK] Added column: ftp_path')
        else:
            print('[SKIP] ftp_path already exists')

        if 'check_status' not in cols:
            conn.execute(sa.text('ALTER TABLE lots ADD COLUMN check_status VARCHAR(20)'))
            print('[OK] Added column: check_status')
        else:
            print('[SKIP] check_status already exists')
else:
    print('[WARN] lots table not found')

# 3. 给 osat_configs 表加新列
if 'osat_configs' in existing_tables:
    cols = [c['name'] for c in inspector.get_columns('osat_configs')]
    with engine.begin() as conn:
        if 'data_type' not in cols:
            conn.execute(sa.text("ALTER TABLE osat_configs ADD COLUMN data_type VARCHAR(10) DEFAULT 'CP'"))
            print('[OK] Added column: data_type')
        else:
            print('[SKIP] data_type already exists')
else:
    print('[WARN] osat_configs table not found')

# 4. 给 pgs_uploads 表加新列
if 'pgs_uploads' in existing_tables:
    cols = [c['name'] for c in inspector.get_columns('pgs_uploads')]
    with engine.begin() as conn:
        if 'remark' not in cols:
            conn.execute(sa.text('ALTER TABLE pgs_uploads ADD COLUMN remark VARCHAR'))
            print('[OK] Added column remark to pgs_uploads')
        else:
            print('[SKIP] remark already exists in pgs_uploads')
else:
    print('[WARN] pgs_uploads table not found')

# 5. 给 program_change_extras 表加新列
if 'program_change_extras' in existing_tables:
    cols = [c['name'] for c in inspector.get_columns('program_change_extras')]
    with engine.begin() as conn:
        if 'remark' not in cols:
            conn.execute(sa.text('ALTER TABLE program_change_extras ADD COLUMN remark VARCHAR'))
            print('[OK] Added column remark to program_change_extras')
        else:
            print('[SKIP] remark already exists in program_change_extras')
else:
    print('[WARN] program_change_extras table not found')

# 6. 创建 lot_shares 表（如果不存在）
if 'lot_shares' not in existing_tables:
    Base.metadata.tables['lot_shares'].create(engine)
    print('[OK] Created table: lot_shares')
else:
    print('[SKIP] lot_shares already exists')

print('\nMigration complete!')
