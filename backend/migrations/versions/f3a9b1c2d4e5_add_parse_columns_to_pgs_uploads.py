"""add parse columns to pgs_uploads

Revision ID: f3a9b1c2d4e5
Revises: e5f1a2b3c4d5
Create Date: 2026-06-04

Fix: pgs_uploads table was created without the parsing-result columns.
     Adding: program_version, pgs_version, parse_status, parse_error,
             parsed_params, parsed_summary
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'f3a9b1c2d4e5'
down_revision = 'e5f1a2b3c4d5'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Use IF NOT EXISTS to make migration idempotent (safe to re-run)
    conn = op.get_bind()
    conn.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS pgs_uploads (
            id SERIAL PRIMARY KEY,
            filename VARCHAR NOT NULL,
            product_name VARCHAR,
            storage_path VARCHAR,
            upload_date TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
            uploader_id INTEGER
        )
    """))
    conn.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_pgs_uploads_id ON pgs_uploads (id)"))
    conn.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_pgs_uploads_product_name ON pgs_uploads (product_name)"))
    conn.execute(sa.text("ALTER TABLE pgs_uploads ADD COLUMN IF NOT EXISTS program_version VARCHAR"))
    conn.execute(sa.text("ALTER TABLE pgs_uploads ADD COLUMN IF NOT EXISTS pgs_version INTEGER"))
    conn.execute(sa.text("ALTER TABLE pgs_uploads ADD COLUMN IF NOT EXISTS parse_status VARCHAR DEFAULT 'pending'"))
    conn.execute(sa.text("ALTER TABLE pgs_uploads ADD COLUMN IF NOT EXISTS parse_error TEXT"))
    conn.execute(sa.text("ALTER TABLE pgs_uploads ADD COLUMN IF NOT EXISTS parsed_params TEXT"))
    conn.execute(sa.text("ALTER TABLE pgs_uploads ADD COLUMN IF NOT EXISTS parsed_summary TEXT"))


def downgrade() -> None:
    op.drop_table('pgs_uploads')
