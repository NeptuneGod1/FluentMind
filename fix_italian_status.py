import sqlite3

def main():
    db_path = 'app.db'
    
    try:
        # Connect to the database
        conn = sqlite3.connect(db_path)
        conn.row_factory = sqlite3.Row  # Enable column access by name
        cursor = conn.cursor()
        
        print("Current Italian language status:")
        
        # Find Italian language
        cursor.execute("""
            SELECT id, name, spacy_model_status 
            FROM language 
            WHERE LOWER(name) LIKE '%italian%'""")
        
        italian = cursor.fetchone()
        
        if italian:
            print(f"Found: ID={italian['id']}, Name='{italian['name']}', Status='{italian['spacy_model_status']}'")
            
            # Update the status
            cursor.execute("""
                UPDATE language 
                SET spacy_model_status = 'not_installed' 
                WHERE id = ?""", (italian['id'],))
            
            conn.commit()
            print("\n✓ Updated Italian language status to 'not_installed'")
            
            # Verify the update
            cursor.execute("SELECT id, name, spacy_model_status FROM language WHERE id = ?", (italian['id'],))
            updated = cursor.fetchone()
            print(f"\nVerification: ID={updated['id']}, Status='{updated['spacy_model_status']}'")
            
            print("\n✅ Success! Please restart the application to trigger model download.")
        else:
            print("Italian language not found in the database.")
            print("\nAvailable languages:")
            cursor.execute("SELECT id, name, spacy_model_status FROM language")
            for row in cursor.fetchall():
                print(f"- {row['name']} (ID: {row['id']}, Status: {row['spacy_model_status'] or 'N/A'})")
            
    except sqlite3.Error as e:
        print(f"\n❌ Database error: {e}")
    except Exception as e:
        print(f"\n❌ Unexpected error: {e}")
    finally:
        if 'conn' in locals():
            conn.close()

if __name__ == "__main__":
    print("Fixing Italian language status...\n")
    main()
    print("\nScript completed.")
