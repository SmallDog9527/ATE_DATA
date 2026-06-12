"""add report source

Revision ID: 2f6b8c9d0e11
Revises: f3a9b1c2d4e5
Create Date: 2026-06-08 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '2f6b8c9d0e11'
down_revision: Union[str, Sequence[str], None] = 'f3a9b1c2d4e5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('reports', sa.Column('source', sa.String(), nullable=False, server_default='eng'))
    op.create_index(op.f('ix_reports_source'), 'reports', ['source'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_reports_source'), table_name='reports')
    op.drop_column('reports', 'source')
