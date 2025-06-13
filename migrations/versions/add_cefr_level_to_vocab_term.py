"""Add CEFR level to VocabTerm

Revision ID: 123456789abc
Revises: 78d9da663ef9
Create Date: 2025-06-11 14:15:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import mysql

# revision identifiers, used by Alembic.
revision = '123456789abc'
down_revision = '78d9da663ef9'
branch_labels = None
depends_on = None

def upgrade():
    # Add CEFR level column (A1, A2, B1, B2, C1, C2)
    op.add_column('vocab_term', 
                 sa.Column('cefr_level', sa.String(2), nullable=True, index=True))
    
    # Add last_updated timestamp
    # Using just CURRENT_TIMESTAMP for SQLite compatibility
    op.add_column('vocab_term',
                 sa.Column('last_updated', sa.DateTime(), 
                           server_default=sa.text('CURRENT_TIMESTAMP'),
                           nullable=True))

def downgrade():
    op.drop_index(op.f('ix_vocab_term_cefr_level'), table_name='vocab_term')
    op.drop_column('vocab_term', 'cefr_level')
    op.drop_column('vocab_term', 'last_updated')
