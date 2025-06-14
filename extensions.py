from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate
from functools import lru_cache
import spacy
import importlib

# Initialize SQLAlchemy and Migrate
db = SQLAlchemy()
migrate = Migrate()

# Map of language names to SpaCy model names
SPACY_MODEL_MAP = {
    "English": "en_core_web_sm",
    "Spanish": "es_core_news_sm",
    "French": "fr_core_news_sm",
    "German": "de_core_news_sm",
    "Chinese": "zh_core_web_sm",
    "Japanese": "ja_core_news_sm",
    "Russian": "ru_core_news_sm",
    "Italian": "it_core_news_sm",
    "Portuguese": "pt_core_news_sm",
    "Dutch": "nl_core_news_sm",
}

class Setting(db.Model):
    key = db.Column(db.String(50), primary_key=True)
    value = db.Column(db.String(200))

@lru_cache(maxsize=10)  # Cache up to 10 different language models
def get_spacy_model(language_name):
    """
    Get a spaCy language model for the specified language.
    
    Args:
        language_name (str): Name of the language (e.g., 'English', 'Spanish')
        
    Returns:
        spacy.language.Language or None: Loaded spaCy model or None if not found/error
    """
    model_name = SPACY_MODEL_MAP.get(
        language_name.capitalize()
    )  # Use .capitalize() to match map keys
    
    if not model_name:
        # Check for lowercase version if capitalize fails (just in case of input variations)
        model_name = SPACY_MODEL_MAP.get(language_name.lower())
        if not model_name:
            print(
                f"Warning: No spaCy model mapping found for language: {language_name}"
            )
            return None
    
    try:
        # Try to load the model
        nlp = spacy.load(model_name)
        print(f"Loaded spaCy model: {model_name}")
        return nlp
    except OSError:
        # Model not downloaded
        print(
            f"Warning: spaCy model '{model_name}' not found. Please run: python -m spacy download {model_name}"
        )
        return None
    except Exception as e:
        # Other loading errors
        print(f"Error loading spaCy model '{model_name}': {e}")
        return None
