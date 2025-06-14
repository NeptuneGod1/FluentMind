import sqlite3
import os

def main():
    db_path = os.path.join(os.getcwd(), 'app.db')
    print(f"Attempting to connect to database at: {db_path}")
    
    if not os.path.exists(db_path):
        print(f"Error: Database file not found at {db_path}")
        return
    
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        print("Successfully connected to the database.")
        
        # List all tables
        print("\nTables in the database:")
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
        tables = cursor.fetchall()
        
        if not tables:
            print("No tables found in the database.")
            return
            
        for table in tables:
            table_name = table[0]
            print(f"\nTable: {table_name}")
            print("-" * 40)
            
            # Get column info
            cursor.execute(f"PRAGMA table_info({table_name});")
            columns = cursor.fetchall()
            
            if not columns:
                print("  No columns found.")
                continue
                
            # Print column names
            col_names = [col[1] for col in columns]
            print(f"  Columns: {', '.join(col_names)}")
            
            # Get row count
            cursor.execute(f"SELECT COUNT(*) FROM {table_name};")
            count = cursor.fetchone()[0]
            print(f"  Rows: {count}")
            
            # Print first few rows for language table
            if table_name == 'language' and count > 0:
                print("\n  First 5 rows:")
                cursor.execute(f"SELECT * FROM {table_name} LIMIT 5;")
                for row in cursor.fetchall():
                    print(f"  {row}")
    
    except sqlite3.Error as e:
        print(f"Database error: {e}")
    except Exception as e:
        print(f"Unexpected error: {e}")
    finally:
        if 'conn' in locals():
            conn.close()
            print("\nDatabase connection closed.")

if __name__ == "__main__":
    print("Starting database test...")
    main()
    print("\nTest completed.")
