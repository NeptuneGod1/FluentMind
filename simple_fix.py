import sqlite3

def main():
    db_path = 'app.db'
    
    try:
        # Connect to the database
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # Find Italian language
        cursor.execute("SELECT id, name, spacy_model_status FROM language WHERE LOWER(name) LIKE '%italian%'")
        italian = cursor.fetchone()
        
        if not italian:
            print("Italian language not found.")
            cursor.execute("SELECT id, name, spacy_model_status FROM language")
            print("\nAvailable languages:")
            for row in cursor.fetchall():
                print(f"- {row[1]} (ID: {row[0]}, Status: {row[2] or 'N/A'})")
            return
        
        lang_id, name, status = italian
        print(f"Found: {name} (ID: {lang_id}, Status: {status})")
        
        # Update status
        cursor.execute("UPDATE language SET spacy_model_status = 'not_installed' WHERE id = ?", (lang_id,))
        conn.commit()
        
        # Verify
        cursor.execute("SELECT spacy_model_status FROM language WHERE id = ?", (lang_id,))
        new_status = cursor.fetchone()[0]
        print(f"\nStatus updated to: {new_status}")
        print("\n✅ Success! Please restart the application to trigger model download.")
        
    except Exception as e:
        print(f"Error: {e}")
    finally:
        if 'conn' in locals():
            conn.close()

if __name__ == "__main__":
    print("Fixing Italian language status...\n")
    main()
    print("\nDone.")
