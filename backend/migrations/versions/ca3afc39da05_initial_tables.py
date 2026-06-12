"""initial tables

Revision ID: ca3afc39da05
Revises: 
Create Date: 2026-03-18 21:02:17.330803

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'ca3afc39da05'
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    op.execute('DROP TABLE IF EXISTS test_results CASCADE')
    op.execute('DROP TABLE IF EXISTS lot_summary CASCADE')
    op.create_table('users',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('username', sa.String(), nullable=False),
        sa.Column('email', sa.String(), nullable=False),
        sa.Column('hashed_password', sa.String(), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=True),
        sa.Column('is_admin', sa.Boolean(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=True),
        sa.Column('storage_type', sa.String(), nullable=True),
        sa.Column('storage_config', sa.String(), nullable=True),
        sa.Column('storage_used_bytes', sa.BigInteger(), nullable=True),
        sa.Column('report_email', sa.String(), nullable=True),
        sa.Column('weekly_report', sa.Boolean(), nullable=True),
        sa.Column('monthly_report', sa.Boolean(), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_users_id', 'users', ['id'])
    op.create_index('ix_users_email', 'users', ['email'], unique=True)
    op.create_index('ix_users_username', 'users', ['username'], unique=True)

    op.create_table('lots',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('filename', sa.String(), nullable=False),
        sa.Column('product_name', sa.String(), nullable=True),
        sa.Column('lot_id', sa.String(), nullable=True),
        sa.Column('wafer_id', sa.String(), nullable=True),
        sa.Column('program', sa.String(), nullable=True),
        sa.Column('test_machine', sa.String(), nullable=True),
        sa.Column('handler', sa.String(), nullable=True),
        sa.Column('data_type', sa.String(), nullable=True),
        sa.Column('test_stage', sa.String(), nullable=True),
        sa.Column('station_count', sa.Integer(), nullable=True),
        sa.Column('die_count', sa.Integer(), nullable=True),
        sa.Column('pass_count', sa.Integer(), nullable=True),
        sa.Column('fail_count', sa.Integer(), nullable=True),
        sa.Column('yield_rate', sa.Float(), nullable=True),
        sa.Column('test_date', sa.DateTime(), nullable=True),
        sa.Column('upload_date', sa.DateTime(), server_default=sa.text('now()'), nullable=True),
        sa.Column('finish_date', sa.DateTime(), nullable=True),
        sa.Column('data_source', sa.String(), nullable=True),
        sa.Column('storage_type', sa.String(), nullable=True),
        sa.Column('storage_path', sa.String(), nullable=True),
        sa.Column('file_size', sa.BigInteger(), nullable=True),
        sa.Column('is_transferred', sa.Integer(), nullable=True),
        sa.Column('local_expires_at', sa.DateTime(), nullable=True),
        sa.Column('status', sa.String(), nullable=True),
        sa.Column('parquet_path', sa.String(), nullable=True),
        sa.Column('user_id', sa.Integer(), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_lots_id', 'lots', ['id'])
    op.create_index('ix_lots_lot_id', 'lots', ['lot_id'])
    op.create_index('ix_lots_product_name', 'lots', ['product_name'])
    op.create_index('ix_lots_user_id', 'lots', ['user_id'])

    op.create_table('bin_summary',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('lot_id', sa.Integer(), sa.ForeignKey('lots.id'), nullable=True),
        sa.Column('bin_number', sa.Integer(), nullable=True),
        sa.Column('bin_name', sa.String(), nullable=True),
        sa.Column('site', sa.Integer(), nullable=True),
        sa.Column('count', sa.Integer(), nullable=True),
        sa.Column('percentage', sa.Float(), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_bin_summary_id', 'bin_summary', ['id'])
    op.create_index('ix_bin_summary_lot_id', 'bin_summary', ['lot_id'])

    op.create_table('test_items',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('lot_id', sa.Integer(), sa.ForeignKey('lots.id'), nullable=True),
        sa.Column('item_number', sa.Integer(), nullable=True),
        sa.Column('item_name', sa.String(), nullable=True),
        sa.Column('unit', sa.String(), nullable=True),
        sa.Column('lower_limit', sa.Float(), nullable=True),
        sa.Column('upper_limit', sa.Float(), nullable=True),
        sa.Column('exec_qty', sa.Integer(), nullable=True),
        sa.Column('fail_count', sa.Integer(), nullable=True),
        sa.Column('fail_rate', sa.Float(), nullable=True),
        sa.Column('yield_rate', sa.Float(), nullable=True),
        sa.Column('mean', sa.Float(), nullable=True),
        sa.Column('stdev', sa.Float(), nullable=True),
        sa.Column('min_val', sa.Float(), nullable=True),
        sa.Column('max_val', sa.Float(), nullable=True),
        sa.Column('cpu', sa.Float(), nullable=True),
        sa.Column('cpl', sa.Float(), nullable=True),
        sa.Column('cpk', sa.Float(), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_test_items_id', 'test_items', ['id'])
    op.create_index('ix_test_items_item_name', 'test_items', ['item_name'])
    op.create_index('ix_test_items_lot_id', 'test_items', ['lot_id'])


def downgrade() -> None:
    """Downgrade schema."""
    # ### commands auto generated by Alembic - please adjust! ###
    op.create_table('test_results',
    sa.Column('id', sa.BIGINT(), autoincrement=True, nullable=False),
    sa.Column('lot_internal_id', sa.INTEGER(), autoincrement=False, nullable=True),
    sa.Column('site_id', sa.INTEGER(), autoincrement=False, nullable=True),
    sa.Column('hard_bin', sa.INTEGER(), autoincrement=False, nullable=True),
    sa.Column('soft_bin', sa.INTEGER(), autoincrement=False, nullable=True),
    sa.Column('die_x', sa.INTEGER(), autoincrement=False, nullable=True),
    sa.Column('die_y', sa.INTEGER(), autoincrement=False, nullable=True),
    sa.Column('test_name', sa.VARCHAR(length=255), autoincrement=False, nullable=True),
    sa.Column('result_value', sa.NUMERIC(), autoincrement=False, nullable=True),
    sa.Column('is_pass', sa.BOOLEAN(), autoincrement=False, nullable=True),
    sa.ForeignKeyConstraint(['lot_internal_id'], ['lot_summary.id'], name=op.f('test_results_lot_internal_id_fkey'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('test_results_pkey'))
    )
    op.create_index(op.f('idx_res_lot_name'), 'test_results', ['lot_internal_id', 'test_name'], unique=False)
    op.create_index(op.f('idx_res_lot_internal'), 'test_results', ['lot_internal_id'], unique=False)
    op.create_index(op.f('idx_res_lot_id'), 'test_results', ['lot_internal_id'], unique=False)
    op.create_index(op.f('idx_res_lot'), 'test_results', ['lot_internal_id'], unique=False)
    op.create_table('lot_summary',
    sa.Column('id', sa.INTEGER(), autoincrement=True, nullable=False),
    sa.Column('lot_id', sa.VARCHAR(length=100), autoincrement=False, nullable=True),
    sa.Column('product_name', sa.VARCHAR(length=100), autoincrement=False, nullable=True),
    sa.Column('total_qty', sa.INTEGER(), autoincrement=False, nullable=True),
    sa.Column('pass_qty', sa.INTEGER(), autoincrement=False, nullable=True),
    sa.Column('yield_rate', sa.NUMERIC(), autoincrement=False, nullable=True),
    sa.Column('test_date', postgresql.TIMESTAMP(), server_default=sa.text('CURRENT_TIMESTAMP'), autoincrement=False, nullable=True),
    sa.PrimaryKeyConstraint('id', name=op.f('lot_summary_pkey'))
    )
    op.drop_index(op.f('ix_test_items_lot_id'), table_name='test_items')
    op.drop_index(op.f('ix_test_items_item_name'), table_name='test_items')
    op.drop_index(op.f('ix_test_items_id'), table_name='test_items')
    op.drop_table('test_items')
    op.drop_index(op.f('ix_bin_summary_lot_id'), table_name='bin_summary')
    op.drop_index(op.f('ix_bin_summary_id'), table_name='bin_summary')
    op.drop_table('bin_summary')
    op.drop_index(op.f('ix_users_username'), table_name='users')
    op.drop_index(op.f('ix_users_id'), table_name='users')
    op.drop_index(op.f('ix_users_email'), table_name='users')
    op.drop_table('users')
    op.drop_index(op.f('ix_lots_user_id'), table_name='lots')
    op.drop_index(op.f('ix_lots_product_name'), table_name='lots')
    op.drop_index(op.f('ix_lots_lot_id'), table_name='lots')
    op.drop_index(op.f('ix_lots_id'), table_name='lots')
    op.drop_table('lots')
    # ### end Alembic commands ###
