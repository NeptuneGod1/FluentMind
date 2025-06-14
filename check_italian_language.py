from app import app, db
from extensions import get_spacy_model

def check_italian_language():
    with app.app_context():
        # Find Italian language in the database
        from models import Language
        
        # Find Italian language by name or code
        italian = Language.query.filter(
            (Language.name.ilike('%italian%')) | 
            (Language.code.ilike('it'))
        ).first()
        
        if not italian:
            print("Error: Italian language not found in the database.")
            return
            
        print(f"Found Italian language: {italian.name} (ID: {italian.id})")
        print(f"SpaCy model: {italian.spacy_model}")
        print(f"SpaCy model status: {italian.spacy_model_status}")
        
        # Try to load the SpaCy model
        print("\nAttempting to load SpaCy model...")
        try:
            nlp = get_spacy_model(italian.name)
            if nlp:
                print("Successfully loaded SpaCy model!")
                print(f"Pipeline components: {nlp.pipe_names}")
                
                # Test with a sample Italian text
                test_text = "Ciao, come stai? Questo è un test."
                doc = nlp(test_text)
                print(f"\nTest text: {test_text}")
                print("Tokens and lemmas:")
                for token in doc:
                    print(f"  {token.text} -> {token.lemma_}")
            else:
                print("Failed to load SpaCy model (returned None)")
        except Exception as e:
            print(f"Error loading SpaCy model: {str(e)}")

if __name__ == "__main__":
    check_italian_language()
