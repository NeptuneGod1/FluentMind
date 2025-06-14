import sys
from app import app, db
from models import Language

def print_header(text):
    print("\n" + "=" * 80)
    print(f" {text} ".center(80, "="))
    print("=" * 80)

def check_language_setup():
    with app.app_context():
        # Print all languages in the database
        print_header("LANGUAGES IN DATABASE")
        languages = Language.query.all()
        if not languages:
            print("No languages found in the database!")
            return
            
        for lang in languages:
            print(f"\nLanguage: {lang.name} (ID: {lang.id}, Code: {lang.code or 'N/A'})")
            print(f"  - SpaCy Model: {lang.spacy_model or 'Not set'}")
            print(f"  - Model Status: {getattr(lang, 'spacy_model_status', 'N/A')}")
            print(f"  - Created: {lang.created_at}")
        
        # Check if Italian is in the list
        italian = next((lang for lang in languages if 'italian' in lang.name.lower() or (lang.code and lang.code.lower() == 'it')), None)
        
        if not italian:
            print("\n\nERROR: Italian language not found in the database!")
            print("Please make sure the Italian language is properly added to the database.")
            return
            
        print_header(f"DETAILS FOR ITALIAN (ID: {italian.id})")
        print(f"Name: {italian.name}")
        print(f"Code: {italian.code}")
        print(f"SpaCy Model: {italian.spacy_model or 'Not set'}")
        print(f"SpaCy Model Status: {getattr(italian, 'spacy_model_status', 'N/A')}")
        
        # Try to import and check SpaCy
        try:
            import spacy
            print("\nSpaCy is installed. Checking for Italian model...")
            
            # Check if the model is installed
            model_name = italian.spacy_model or "it_core_news_sm"
            print(f"\nChecking for model: {model_name}")
            
            try:
                import importlib
                importlib.import_module(model_name)
                print(f"  ✓ Model '{model_name}' is installed")
                
                # Try to load the model
                print("\nAttempting to load the model...")
                try:
                    nlp = spacy.load(model_name)
                    print(f"  ✓ Successfully loaded model: {model_name}")
                    print(f"  ✓ Pipeline components: {', '.join(nlp.pipe_names)}")
                    
                    # Test with sample text
                    test_text = "Ciao, come stai? Questo è un test di esempio."
                    print(f"\nTesting with text: {test_text}")
                    doc = nlp(test_text)
                    print("  Tokens and lemmas:")
                    for token in doc:
                        print(f"    {token.text:<15} -> {token.lemma_}")
                    
                except Exception as e:
                    print(f"  ✗ Error loading model: {str(e)}")
                    print("  Try running: python -m spacy download", model_name)
                    
            except ImportError:
                print(f"  ✗ Model '{model_name}' is not installed")
                print(f"  Try installing it with: python -m spacy download {model_name}")
                
        except ImportError:
            print("\nERROR: SpaCy is not installed. Please install it with:")
            print("pip install -U spacy")

if __name__ == "__main__":
    print_header("LANGUAGE SETUP DIAGNOSTIC TOOL")
    check_language_setup()
    print("\n" + "=" * 80)
    print(" DIAGNOSTIC COMPLETE ".center(80, "="))
    print("=" * 80)
