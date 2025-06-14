import sqlite3

def main():
    db_path = 'app.db'
    
    try:
        # Connect to the database
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # Get table info
        print("Table structure for 'language':")
        cursor.execute("PRAGMA table_info(language);")
        columns = cursor.fetchall()
        
        if not columns:
            print("No columns found in 'language' table.")
            return
            
        print("\nColumns in 'language' table:")
        for col in columns:
            print(f"- {col[1]} ({col[2]})")
        
        # Show sample data
        print("\nSample data from 'language' table:")
        cursor.execute("SELECT * FROM language LIMIT 3;")
        rows = cursor.fetchall()
        
        if not rows:
            print("No data found in 'language' table.")
            return
            
        for row in rows:
            print(f"- {row}")
            
    except sqlite3.Error as e:
        print(f"Database error: {e}")
    finally:
        if 'conn' in locals():
            conn.close()

if __name__ == "__main__":
    print("Checking database structure...\n")
    main()
    print("\nDone.")
