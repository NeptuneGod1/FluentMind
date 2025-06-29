"""Remove lemma unique constraint

Revision ID: 62f80b3c9369
Revises: 77e6e968244e
Create Date: 2025-06-12 21:05:40.231862

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '62f80b3c9369'
down_revision = '77e6e968244e'
branch_labels = None
depends_on = None


def upgrade():
    # ### commands auto generated by Alembic - please adjust! ###
    with op.batch_alter_table('_alembic_tmp_vocab_term', schema=None) as batch_op:
        batch_op.drop_index('ix__alembic_tmp_vocab_term_cefr_level')

    op.drop_table('_alembic_tmp_vocab_term')
    with op.batch_alter_table('vocab_term', schema=None) as batch_op:
        batch_op.drop_index('ix_vocab_term_cefr_level')
        batch_op.drop_constraint('uq_language_lemma', type_='unique')
        batch_op.drop_column('cefr_level')

    # ### end Alembic commands ###


def downgrade():
    # ### commands auto generated by Alembic - please adjust! ###
    with op.batch_alter_table('vocab_term', schema=None) as batch_op:
        batch_op.add_column(sa.Column('cefr_level', sa.VARCHAR(length=2), nullable=True))
        batch_op.create_unique_constraint('uq_language_lemma', ['language_id', 'lemma'])
        batch_op.create_index('ix_vocab_term_cefr_level', ['cefr_level'], unique=False)

    op.create_table('_alembic_tmp_vocab_term',
    sa.Column('id', sa.INTEGER(), nullable=False),
    sa.Column('language_id', sa.INTEGER(), nullable=False),
    sa.Column('term', sa.VARCHAR(length=200), nullable=False),
    sa.Column('lemma', sa.VARCHAR(length=200), nullable=True),
    sa.Column('status', sa.INTEGER(), nullable=False),
    sa.Column('translation', sa.TEXT(), nullable=True),
    sa.Column('next_review_date', sa.DATETIME(), nullable=True),
    sa.Column('interval', sa.INTEGER(), nullable=True),
    sa.Column('ease_factor', sa.FLOAT(), nullable=True),
    sa.Column('context_sentence', sa.TEXT(), nullable=True),
    sa.Column('last_reviewed_direction', sa.VARCHAR(length=3), nullable=True),
    sa.Column('last_review_date', sa.DATETIME(), nullable=True),
    sa.Column('difficulty', sa.FLOAT(), nullable=True),
    sa.Column('stability', sa.FLOAT(), nullable=True),
    sa.Column('reviews', sa.INTEGER(), nullable=True),
    sa.Column('lapses', sa.INTEGER(), nullable=True),
    sa.Column('state', sa.VARCHAR(length=20), nullable=True),
    sa.Column('last_rating_type', sa.VARCHAR(length=10), nullable=True),
    sa.Column('cefr_level', sa.VARCHAR(length=2), nullable=True),
    sa.Column('last_updated', sa.DATETIME(), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=True),
    sa.ForeignKeyConstraint(['language_id'], ['language.id'], ),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('language_id', 'lemma', name='uq_language_lemma'),
    sa.UniqueConstraint('language_id', 'term', name='uq_language_term')
    )
    with op.batch_alter_table('_alembic_tmp_vocab_term', schema=None) as batch_op:
        batch_op.create_index('ix__alembic_tmp_vocab_term_cefr_level', ['cefr_level'], unique=False)

    # ### end Alembic commands ###
