"""add osat ftp encryption and summary dir

Revision ID: 3a71c4e9f2ab
Revises: 2f6b8c9d0e11
Create Date: 2026-06-08 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '3a71c4e9f2ab'
down_revision: Union[str, Sequence[str], None] = '2f6b8c9d0e11'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    conn.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS osat_configs (
            id SERIAL PRIMARY KEY,
            name VARCHAR NOT NULL,
            ftp_host VARCHAR NOT NULL,
            ftp_port INTEGER DEFAULT 21,
            ftp_user VARCHAR NOT NULL,
            ftp_pass_enc VARCHAR NOT NULL,
            ftp_encryption VARCHAR DEFAULT 'plain',
            ftp_remote_dir VARCHAR DEFAULT '/',
            ftp_summary_dir VARCHAR DEFAULT '/',
            schedule_start VARCHAR DEFAULT '22:00',
            schedule_end VARCHAR DEFAULT '08:00',
            enabled BOOLEAN DEFAULT FALSE,
            data_type VARCHAR DEFAULT 'CP',
            created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
            updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now()
        );
    """))
    conn.execute(sa.text("CREATE UNIQUE INDEX IF NOT EXISTS ix_osat_configs_name ON osat_configs (name)"))
    conn.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_osat_configs_id ON osat_configs (id)"))
    conn.execute(sa.text("ALTER TABLE osat_configs ADD COLUMN IF NOT EXISTS ftp_encryption VARCHAR DEFAULT 'plain'"))
    conn.execute(sa.text("ALTER TABLE osat_configs ADD COLUMN IF NOT EXISTS ftp_summary_dir VARCHAR DEFAULT '/'"))


def downgrade() -> None:
    conn = op.get_bind()
    conn.execute(sa.text("ALTER TABLE osat_configs DROP COLUMN IF EXISTS ftp_summary_dir"))
    conn.execute(sa.text("ALTER TABLE osat_configs DROP COLUMN IF EXISTS ftp_encryption"))
