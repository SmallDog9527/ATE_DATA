"""add deleted to processstatus

Revision ID: d4e5f6a7b8c9
Revises: 4b6c8d0e2f13
Create Date: 2026-06-18 17:10:00.000000

"""
from typing import Sequence, Union

from alembic import op


revision: str = "d4e5f6a7b8c9"
down_revision: Union[str, Sequence[str], None] = "4b6c8d0e2f13"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TYPE processstatus ADD VALUE IF NOT EXISTS 'deleted'")


def downgrade() -> None:
    # PostgreSQL cannot drop enum values without recreating the enum type.
    pass
