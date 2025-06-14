import os
import sqlite3

def print_header(text):
    print("\n" + "=" * 80)
    print(f" {text} ".center(80, "="))
    print("=" * 80)

def reset_language_status():
    db_path = os.path.join(os.getcwd(), 'app.db')
    
    if not os.path.exists(db_path):
        print(f"Error: Database not found at {db_path}")
        return False
    
    try:
        # Connect to the database
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # Find languages with 'downloading' status
        cursor.execute("""
            SELECT id, name, code, spacy_model, spacy_model_status 
            FROM language 
            WHERE spacy_model_status = 'downloading';
        """)
        
        languages = cursor.fetchall()
        
        if not languages:
            print("No languages found with 'downloading' status.")
            return True
        
        print(f"Found {len(languages)} language(s) with 'downloading' status:")
        for lang in languages:
            lang_id, name, code, spacy_model, status = lang
            print(f"- {name} (ID: {lang_id}, Code: {code or 'N/A'}, Model: {spacy_model or 'N/A'})")
        
        # Ask for confirmation
        confirm = input("\nReset these languages to 'not_installed'? (y/n): ").strip().lower()
        if confirm != 'y':
            print("Operation cancelled.")
            return False
        
        # Reset the status
        cursor.execute("""
            UPDATE language 
            SET spacy_model_status = 'not_installed' 
            WHERE spacy_model_status = 'downloading';
        """)
        
        conn.commit()
        print(f"\nSuccessfully reset {len(languages)} language(s) to 'not_installed' status.")
        
        # Verify the update
        cursor.execute("""
            SELECT id, name, spacy_model_status 
            FROM language 
            WHERE id IN ({})
        """.format(','.join('?' * len(languages)), *[lang[0] for lang in languages]))
        
        updated = cursor.fetchall()
        print("\nUpdated status:")
        for lang_id, name, status in updated:
            print(f"- {name} (ID: {lang_id}): {status}")
        
        return True
        
    except sqlite3.Error as e:
        print(f"\nDatabase error: {e}")
        return False
    except Exception as e:
        print(f"\nUnexpected error: {e}")
        return False
    finally:
        if 'conn' in locals():
            conn.close()

def main():
    print_header("LANGUAGE STATUS RESET TOOL")
    print("This tool will reset any language with 'downloading' status to 'not_installed'.")
    print("This will allow the system to attempt downloading the SpaCy model again.")
    
    if reset_language_status():
        print("\nNext steps:")
        print("1. Restart the application to trigger model download")
        print("2. Check the application logs for download progress")
        print("3. If the download fails, check your internet connection and try again")
    
    print("\n" + "=" * 80)
    print(" TOOL COMPLETE ".center(80, "="))
    print("=" * 80)

if __name__ == "__main__":
    main()
