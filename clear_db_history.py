import sqlite3

def clear_alembic_history():
    db_path = 'app.db'
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        cursor.execute("DROP TABLE IF EXISTS alembic_version")
        print("alembic_version table dropped successfully.")
        
        conn.commit()
    except sqlite3.Error as e:
        print(f"Database error: {e}")
    finally:
        if conn:
            conn.close()

if __name__ == '__main__':
    clear_alembic_history() 