import os
import sys
import sqlite3

def print_header(text):
    print("\n" + "=" * 80)
    print(f" {text} ".center(80, "="))
    print("=" * 80)

def check_database():
    print_header("DATABASE CHECK")
    
    # Try to find the database file
    db_path = os.path.join(os.getcwd(), 'instance', 'lwt.db')
    if not os.path.exists(db_path):
        print(f"Database not found at: {db_path}")
        print("Looking for database in other locations...")
        
        # Check common alternative locations
        alt_paths = [
            os.path.join(os.getcwd(), 'lwt.db'),
            os.path.join(os.getcwd(), 'database.db'),
            os.path.join(os.getcwd(), 'app.db'),
            os.path.join(os.getcwd(), 'instance', 'database.db'),
            os.path.join(os.getcwd(), 'instance', 'app.db')
        ]
        
        for path in alt_paths:
            if os.path.exists(path):
                db_path = path
                print(f"Found database at: {db_path}")
                break
        else:
            print("Error: Could not find the database file.")
            print("Please make sure the application has been initialized and the database exists.")
            return None
    
    print(f"Found database at: {db_path}")
    return db_path

def check_italian_language(db_path):
    print_header("CHECKING ITALIAN LANGUAGE CONFIGURATION")
    
    if not db_path:
        print("Cannot check language configuration - no database path provided.")
        return
    
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # Check if the Language table exists
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='language';")
        if not cursor.fetchone():
            print("Error: 'language' table not found in the database.")
            return
        
        # Get all languages
        print("\nLanguages in database:")
        cursor.execute("SELECT id, name, code, spacy_model, spacy_model_status FROM language;")
        languages = cursor.fetchall()
        
        if not languages:
            print("No languages found in the database!")
            return
            
        for lang_id, name, code, spacy_model, spacy_status in languages:
            print(f"\n- {name} (ID: {lang_id}, Code: {code or 'N/A'})")
            print(f"  SpaCy Model: {spacy_model or 'Not set'}")
            print(f"  Status: {spacy_status or 'N/A'}")
        
        # Check for Italian
        cursor.execute(
            "SELECT id, name, code, spacy_model, spacy_model_status FROM language WHERE name LIKE '%italian%' OR code = 'it';"
        )
        italian = cursor.fetchone()
        
        if italian:
            lang_id, name, code, spacy_model, spacy_status = italian
            print("\n" + "-" * 50)
            print(f"FOUND ITALIAN: {name} (ID: {lang_id}, Code: {code or 'N/A'})")
            print(f"  SpaCy Model: {spacy_model or 'Not set'}")
            print(f"  Status: {spacy_status or 'N/A'}")
            print("-" * 50)
        else:
            print("\nNo Italian language found in the database!")
            
    except sqlite3.Error as e:
        print(f"Database error: {e}")
    finally:
        if 'conn' in locals():
            conn.close()

def check_spacy_installation():
    print_header("CHECKING SPACY INSTALLATION")
    
    try:
        import spacy
        print("✓ spaCy is installed")
        print(f"spaCy version: {spacy.__version__}")
        
        # Check for Italian model
        print("\nChecking for Italian model...")
        try:
            import it_core_news_sm
            print("✓ Italian model (it_core_news_sm) is installed")
        except ImportError:
            print("✗ Italian model (it_core_news_sm) is NOT installed")
            print("  Install it with: python -m spacy download it_core_news_sm")
        
        # List all installed models
        print("\nInstalled spaCy models:")
        from spacy.util import get_package
        for name in ["it_core_news_sm", "en_core_web_sm", "es_core_news_sm", "fr_core_news_sm", "de_core_news_sm"]:
            try:
                model = get_package(name)
                print(f"✓ {name} (version: {model.__version__ if hasattr(model, '__version__') else 'unknown'})")
            except ImportError:
                print(f"✗ {name} (not installed)")
                
    except ImportError:
        print("✗ spaCy is not installed")
        print("Install it with: pip install -U spacy")

if __name__ == "__main__":
    print_header("LANGUAGE PROCESSING DIAGNOSTIC TOOL")
    
    # Check database
    db_path = check_database()
    
    # Check Italian language configuration
    check_italian_language(db_path)
    
    # Check spaCy installation
    check_spacy_installation()
    
    print_header("DIAGNOSTIC COMPLETE")
