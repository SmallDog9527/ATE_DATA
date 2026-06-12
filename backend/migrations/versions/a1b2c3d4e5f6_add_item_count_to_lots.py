"""Add item_count to lots

Revision ID: a1b2c3d4e5f6
Revises: 30a7f2112187
Create Date: 2026-04-19 10:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, Sequence[str], None] = '30a7f2112187'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('lots', sa.Column('item_count', sa.Integer(), nullable=True, server_default='0'))


def downgrade() -> None:
    op.drop_column('lots', 'item_count')
