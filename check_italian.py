import os
import sys
import sqlite3

def print_header(text):
    print("\n" + "=" * 80)
    print(f" {text} ".center(80, "="))
    print("=" * 80)

def main():
    print_header("ITALIAN LANGUAGE CHECK")
    
    # Check if database exists
    db_path = os.path.join(os.getcwd(), 'app.db')
    if not os.path.exists(db_path):
        print(f"Error: Database not found at {db_path}")
        return
    
    print(f"Found database at: {db_path}")
    
    try:
        # Connect to the database
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # Check if language table exists
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='language';")
        if not cursor.fetchone():
            print("Error: 'language' table not found in the database")
            return
        
        # Get Italian language record
        cursor.execute("""
            SELECT id, name, code, spacy_model, spacy_model_status 
            FROM language 
            WHERE LOWER(name) LIKE '%italian%' OR LOWER(code) = 'it';
        """)
        
        italian = cursor.fetchone()
        
        if italian:
            lang_id, name, code, spacy_model, spacy_status = italian
            print(f"\nFound Italian language in database:")
            print(f"  ID: {lang_id}")
            print(f"  Name: {name}")
            print(f"  Code: {code}")
            print(f"  SpaCy Model: {spacy_model or 'Not set'}")
            print(f"  SpaCy Status: {spacy_status or 'Not set'}")
            
            # Check if the model is installed
            if spacy_model:
                print("\nChecking if the SpaCy model is installed...")
                try:
                    import spacy
                    try:
                        nlp = spacy.load(spacy_model)
                        print(f"✓ Model '{spacy_model}' is installed and can be loaded")
                        print(f"  Pipeline components: {', '.join(nlp.pipe_names)}")
                        
                        # Test with sample Italian text
                        test_text = "Ciao, come stai? Questo è un test."
                        print(f"\nTesting with text: {test_text}")
                        doc = nlp(test_text)
                        print("  Tokens and lemmas:")
                        for token in doc:
                            print(f"    {token.text:<15} -> {token.lemma_}")
                            
                    except Exception as e:
                        print(f"✗ Error loading model '{spacy_model}': {e}")
                        print(f"  Try installing it with: python -m spacy download {spacy_model}")
                        
                except ImportError:
                    print("✗ spaCy is not installed. Please install it with:")
                    print("  pip install -U spacy")
        else:
            print("\nNo Italian language found in the database.")
            print("\nAvailable languages:")
            cursor.execute("SELECT id, name, code FROM language;")
            for row in cursor.fetchall():
                print(f"  - {row[1]} (ID: {row[0]}, Code: {row[2] or 'N/A'})")
    
    except sqlite3.Error as e:
        print(f"\nDatabase error: {e}")
    except Exception as e:
        print(f"\nUnexpected error: {e}")
    finally:
        if 'conn' in locals():
            conn.close()

if __name__ == "__main__":
    main()
    print("\n" + "=" * 80)
    print(" CHECK COMPLETE ".center(80, "="))
    print("=" * 80)
