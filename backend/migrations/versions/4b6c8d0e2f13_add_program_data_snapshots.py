"""add program data snapshots

Revision ID: 4b6c8d0e2f13
Revises: 3a71c4e9f2ab
Create Date: 2026-06-12 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


revision: str = "4b6c8d0e2f13"
down_revision: Union[str, Sequence[str], None] = "3a71c4e9f2ab"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS program_data_snapshots (
            id SERIAL NOT NULL,
            product_name VARCHAR NOT NULL,
            days INTEGER,
            months VARCHAR,
            row_count INTEGER NOT NULL DEFAULT 0,
            rows_json TEXT NOT NULL,
            created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
            updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
            PRIMARY KEY (id)
        )
    """)
    op.execute("""
        CREATE UNIQUE INDEX IF NOT EXISTS ix_program_data_snapshots_product_name
        ON program_data_snapshots (product_name)
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_program_data_snapshots_id
        ON program_data_snapshots (id)
    """)


def downgrade() -> None:
    op.drop_index("ix_program_data_snapshots_id", table_name="program_data_snapshots")
    op.drop_index("ix_program_data_snapshots_product_name", table_name="program_data_snapshots")
    op.drop_table("program_data_snapshots")
