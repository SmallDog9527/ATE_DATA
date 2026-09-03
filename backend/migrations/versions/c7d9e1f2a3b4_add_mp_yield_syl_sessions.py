"""add mp_yield_syl_sessions table

Revision ID: c7d9e1f2a3b4
Revises: 1ca516947112
Create Date: 2026-02-01 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'c7d9e1f2a3b4'
down_revision: Union[str, Sequence[str], None] = '1ca516947112'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Use IF NOT EXISTS to be idempotent (table may have been created
    # previously by Base.metadata.create_all() in app startup).
    op.execute("""
        CREATE TABLE IF NOT EXISTS mp_yield_syl_sessions (
            id SERIAL NOT NULL,
            product_name VARCHAR NOT NULL,
            setup_time TIMESTAMP WITHOUT TIME ZONE NOT NULL,
            raw_text TEXT,
            rules JSONB NOT NULL DEFAULT '[]'::jsonb,
            created_by INTEGER,
            created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
            PRIMARY KEY (id)
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_mp_yield_syl_sessions_id ON mp_yield_syl_sessions (id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_mp_yield_syl_sessions_product_name ON mp_yield_syl_sessions (product_name)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_mp_yield_syl_sessions_setup_time ON mp_yield_syl_sessions (setup_time)")


def downgrade() -> None:
    op.drop_index('ix_mp_yield_syl_sessions_setup_time', table_name='mp_yield_syl_sessions')
    op.drop_index('ix_mp_yield_syl_sessions_product_name', table_name='mp_yield_syl_sessions')
    op.drop_index('ix_mp_yield_syl_sessions_id', table_name='mp_yield_syl_sessions')
    op.drop_table('mp_yield_syl_sessions')
