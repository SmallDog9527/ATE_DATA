"""initial tables

Revision ID: c1f56aec599a
Revises: ca3afc39da05
Create Date: 2026-03-19 09:50:09.446132

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c1f56aec599a'
down_revision: Union[str, Sequence[str], None] = 'ca3afc39da05'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    """Upgrade schema."""
    # 先手动创建枚举类型
    datasource_enum = sa.Enum('manual', 'ftp', name='datasource')
    storagetype_enum = sa.Enum('local', 'ftp', 's3', 'webdav', name='storagetype')
    processstatus_enum = sa.Enum('pending', 'processing', 'processed', 'failed', name='processstatus')
    
    datasource_enum.create(op.get_bind(), checkfirst=True)
    storagetype_enum.create(op.get_bind(), checkfirst=True)
    processstatus_enum.create(op.get_bind(), checkfirst=True)

    # 再修改列类型
    op.alter_column('lots', 'data_source',
               existing_type=sa.VARCHAR(),
               type_=datasource_enum,
               existing_nullable=True,
               postgresql_using="data_source::datasource")
    op.alter_column('lots', 'storage_type',
               existing_type=sa.VARCHAR(),
               type_=storagetype_enum,
               existing_nullable=True,
               postgresql_using="storage_type::storagetype")
    op.alter_column('lots', 'status',
               existing_type=sa.VARCHAR(),
               type_=processstatus_enum,
               existing_nullable=True,
               postgresql_using="status::processstatus")


def downgrade() -> None:
    """Downgrade schema."""
    op.alter_column('lots', 'status',
               existing_type=sa.Enum('pending', 'processing', 'processed', 'failed', name='processstatus'),
               type_=sa.VARCHAR(),
               existing_nullable=True,
               postgresql_using="status::varchar")
    op.alter_column('lots', 'storage_type',
               existing_type=sa.Enum('local', 'ftp', 's3', 'webdav', name='storagetype'),
               type_=sa.VARCHAR(),
               existing_nullable=True,
               postgresql_using="storage_type::varchar")
    op.alter_column('lots', 'data_source',
               existing_type=sa.Enum('manual', 'ftp', name='datasource'),
               type_=sa.VARCHAR(),
               existing_nullable=True,
               postgresql_using="data_source::varchar")

    # 最后删除枚举类型
    sa.Enum(name='processstatus').drop(op.get_bind(), checkfirst=True)
    sa.Enum(name='storagetype').drop(op.get_bind(), checkfirst=True)
    sa.Enum(name='datasource').drop(op.get_bind(), checkfirst=True)