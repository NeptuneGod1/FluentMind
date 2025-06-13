from app import app, db
import sqlite3

def add_columns():
    with app.app_context():
        # Connect to the database
        conn = sqlite3.connect('app.db')
        cursor = conn.cursor()
        
        try:
            # Add last_reviewed_direction column
            cursor.execute('ALTER TABLE vocab_term ADD COLUMN last_reviewed_direction VARCHAR(3)')
            print("Added last_reviewed_direction column")
            
            # Add last_review_date column
            cursor.execute('ALTER TABLE vocab_term ADD COLUMN last_review_date DATETIME')
            print("Added last_review_date column")
            
            # Commit the changes
            conn.commit()
            print("Successfully added columns")
            
        except sqlite3.OperationalError as e:
            if "duplicate column name" in str(e):
                print("Columns already exist")
            else:
                print(f"Error: {e}")
        finally:
            conn.close()

if __name__ == '__main__':
    add_columns() 