from app import app, db
from sqlalchemy import inspect

def check_table_columns():
    with app.app_context():
        inspector = inspect(db.engine)
        columns = inspector.get_columns('vocab_term')
        print("Columns in vocab_term table:")
        for column in columns:
            print(f"- {column['name']} ({column['type']})")

if __name__ == '__main__':
    check_table_columns()
