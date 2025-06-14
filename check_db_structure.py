import os
import sqlite3

def print_header(text):
    print("\n" + "=" * 80)
    print(f" {text} ".center(80, "="))
    print("=" * 80)

def check_database_structure():
    db_path = os.path.join(os.getcwd(), 'app.db')
    
    if not os.path.exists(db_path):
        print(f"Database not found at: {db_path}")
        return
    
    print(f"Database found at: {db_path}")
    print(f"File size: {os.path.getsize(db_path) / (1024*1024):.2f} MB")
    
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # Get all tables
        print_header("DATABASE TABLES")
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
        tables = cursor.fetchall()
        
        if not tables:
            print("No tables found in the database!")
            return
        
        table_names = [t[0] for t in tables]
        print(f"Found {len(table_names)} tables: {', '.join(table_names)}")
        
        # Check for key tables
        for table in ['language', 'vocab_term', 'lesson', 'story']:
            if table in table_names:
                print(f"\nTable: {table}")
                print("-" * 50)
                
                # Get column info
                cursor.execute(f"PRAGMA table_info({table});")
                columns = cursor.fetchall()
                print("Columns:")
                for col in columns:
                    print(f"  {col[1]} ({col[2]})")
                
                # Get row count
                cursor.execute(f"SELECT COUNT(*) FROM {table};")
                count = cursor.fetchone()[0]
                print(f"\nRow count: {count}")
                
                # Print first few rows for language table
                if table == 'language' and count > 0:
                    print("\nSample data (first 5 rows):")
                    cursor.execute(f"SELECT * FROM {table} LIMIT 5;")
                    for row in cursor.fetchall():
                        print(f"  {row}")
        
        # Check for Italian language
        print_header("CHECKING FOR ITALIAN LANGUAGE")
        if 'language' in table_names:
            cursor.execute("SELECT * FROM language WHERE name LIKE '%italian%' OR code = 'it';")
            italian = cursor.fetchone()
            
            if italian:
                print("Italian language found in database:")
                # Get column names
                cursor.execute("PRAGMA table_info(language);")
                columns = [col[1] for col in cursor.fetchall()]
                
                # Print column names and values
                for col, value in zip(columns, italian):
                    print(f"  {col}: {value}")
            else:
                print("No Italian language found in the database.")
                
                # List all languages
                cursor.execute("SELECT id, name, code FROM language;")
                languages = cursor.fetchall()
                if languages:
                    print("\nAvailable languages:")
                    for lang_id, name, code in languages:
                        print(f"  - {name} (ID: {lang_id}, Code: {code or 'N/A'})")
        
    except sqlite3.Error as e:
        print(f"Database error: {e}")
    finally:
        if 'conn' in locals():
            conn.close()

if __name__ == "__main__":
    print_header("DATABASE STRUCTURE CHECK")
    check_database_structure()
    print("\n" + "=" * 80)
    print(" CHECK COMPLETE ".center(80, "="))
    print("=" * 80)
