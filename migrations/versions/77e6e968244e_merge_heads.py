"""merge heads

Revision ID: 77e6e968244e
Revises: 70107648e11e, 123456789abc
Create Date: 2025-06-11 19:35:17.236615

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '77e6e968244e'
down_revision = ('70107648e11e', '123456789abc')
branch_labels = None
depends_on = None


def upgrade():
    pass


def downgrade():
    pass
