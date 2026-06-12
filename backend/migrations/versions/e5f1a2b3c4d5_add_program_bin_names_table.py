"""add program_bin_names table

Revision ID: e5f1a2b3c4d5
Revises: 91e1112b0a63
Create Date: 2026-06-02 11:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'e5f1a2b3c4d5'
down_revision: Union[str, Sequence[str], None] = '91e1112b0a63'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Use IF NOT EXISTS to be idempotent (table may have been created
    # previously by Base.metadata.create_all() in init_db.py)
    op.execute("""
        CREATE TABLE IF NOT EXISTS program_bin_names (
            id SERIAL NOT NULL,
            program VARCHAR,
            bin_number INTEGER,
            bin_name VARCHAR,
            created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
            updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
            PRIMARY KEY (id)
        )
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_program_bin_names_id
        ON program_bin_names (id)
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_program_bin_names_program
        ON program_bin_names (program)
    """)


def downgrade() -> None:
    op.drop_index('ix_program_bin_names_program', table_name='program_bin_names')
    op.drop_index('ix_program_bin_names_id', table_name='program_bin_names')
    op.drop_table('program_bin_names')
