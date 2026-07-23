"""add ftp scan snapshots table

Revision ID: 1ca516947112
Revises: ca19106c1773
Create Date: 2026-07-09 02:41:35.985748

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '1ca516947112'
down_revision: Union[str, Sequence[str], None] = 'ca19106c1773'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Create system_settings table if it doesn't exist
    op.execute("""
        CREATE TABLE IF NOT EXISTS system_settings (
            id SERIAL PRIMARY KEY,
            smtp_host VARCHAR,
            smtp_port INTEGER,
            smtp_user VARCHAR,
            smtp_pass_enc VARCHAR,
            smtp_from VARCHAR,
            smtp_ssl BOOLEAN DEFAULT TRUE,
            version_update_content VARCHAR,
            updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now()
        );
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_system_settings_id ON system_settings (id)")

    # 2. Create ftp_scan_snapshots table if it doesn't exist
    op.execute("""
        CREATE TABLE IF NOT EXISTS ftp_scan_snapshots (
            id SERIAL PRIMARY KEY,
            scan_date DATE NOT NULL,
            osat_id INTEGER NOT NULL,
            success_count INTEGER DEFAULT 0 NOT NULL,
            failed_count INTEGER DEFAULT 0 NOT NULL,
            scanned_count INTEGER DEFAULT 0 NOT NULL,
            last_scan_time TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
            FOREIGN KEY (osat_id) REFERENCES osat_configs (id) ON DELETE CASCADE
        );
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_ftp_scan_snapshots_id ON ftp_scan_snapshots (id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_ftp_scan_snapshots_scan_date ON ftp_scan_snapshots (scan_date)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_ftp_scan_snapshots_osat_id ON ftp_scan_snapshots (osat_id)")

    # 3. Drop alarm_email column if it exists in system_settings
    op.execute("ALTER TABLE system_settings DROP COLUMN IF EXISTS alarm_email")


def downgrade() -> None:
    op.execute("ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS alarm_email VARCHAR")
    op.drop_table('ftp_scan_snapshots')
