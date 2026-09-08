"""add_stage_columns

Revision ID: 4bc127ea3d90
Revises: af972b2a462c
Create Date: 2026-09-07 13:26:33.459293
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '4bc127ea3d90'
down_revision: Union[str, Sequence[str], None] = 'af972b2a462c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('lots', sa.Column('stage', sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column('lots', 'stage')
