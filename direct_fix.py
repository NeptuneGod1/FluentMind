import sqlite3

def main():
    db_path = 'app.db'
    
    try:
        # Connect to the database
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        print("Current Italian language status:")
        cursor.execute("""
            SELECT id, name, code, spacy_model_status 
            FROM language 
            WHERE LOWER(name) LIKE '%italian%' OR LOWER(code) = 'it'
        """)
        
        italian = cursor.fetchone()
        if italian:
            print(f"Found Italian: {italian}")
            
            # Update the status
            cursor.execute("""
                UPDATE language 
                SET spacy_model_status = 'not_installed' 
                WHERE LOWER(name) LIKE '%italian%' OR LOWER(code) = 'it'
            """)
            
            conn.commit()
            print("\nUpdated Italian language status to 'not_installed'")
            
            # Verify the update
            cursor.execute("""
                SELECT id, name, code, spacy_model_status 
                FROM language 
                WHERE LOWER(name) LIKE '%italian%' OR LOWER(code) = 'it'
            """)
            
            updated = cursor.fetchone()
            print(f"\nNew status: {updated}")
            print("\nPlease restart the application to trigger model download.")
        else:
            print("Italian language not found in the database.")
            
    except sqlite3.Error as e:
        print(f"Database error: {e}")
    finally:
        if 'conn' in locals():
            conn.close()

if __name__ == "__main__":
    print("Fixing Italian language status...\n")
    main()
    print("\nDone.")
