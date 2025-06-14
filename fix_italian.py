import sqlite3

def main():
    db_path = 'app.db'
    
    try:
        # Connect to the database
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # Get Italian language
        cursor.execute("""
            SELECT id, name, code, spacy_model_status 
            FROM language 
            WHERE LOWER(name) LIKE '%italian%' OR LOWER(code) = 'it';
        """)
        
        italian = cursor.fetchone()
        
        if not italian:
            print("Italian language not found in the database.")
            return
            
        lang_id, name, code, status = italian
        print(f"Found Italian language: {name} (ID: {lang_id}, Status: {status})")
        
        # Update the status
        cursor.execute("""
            UPDATE language 
            SET spacy_model_status = 'not_installed' 
            WHERE id = ?
        "", (lang_id,))
        
        conn.commit()
        print("\nSuccessfully reset Italian language status to 'not_installed'.")
        print("Restart the application to trigger model download.")
        
    except sqlite3.Error as e:
        print(f"Database error: {e}")
    finally:
        if 'conn' in locals():
            conn.close()

if __name__ == "__main__":
    print("Fixing Italian language status...")
    main()
    print("\nDone.")
