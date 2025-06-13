import spacy
from typing import Dict, Optional, Tuple, List
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Map of language names to spaCy models
SPACY_MODELS = {
    'english': 'en_core_web_sm',
    'spanish': 'es_core_news_sm',
    'french': 'fr_core_news_sm',
    'german': 'de_core_news_sm',
    'portuguese': 'pt_core_news_sm',
    'italian': 'it_core_news_sm',
    'dutch': 'nl_core_news_sm',
    'greek': 'el_core_news_sm',
    'norwegian': 'nb_core_news_sm',
    'lithuanian': 'lt_core_news_sm',
    'danish': 'da_core_news_sm',
    'polish': 'pl_core_news_sm',
    'romanian': 'ro_core_news_sm',
    'japanese': 'ja_core_news_sm',
    'chinese': 'zh_core_web_sm',
    'russian': 'ru_core_news_sm'
}

# Cache for loaded spaCy models
_nlp_models = {}

def get_nlp(language: str):
    """Get or load the spaCy model for the specified language."""
    language = language.lower()
    
    if language not in _nlp_models:
        model_name = SPACY_MODELS.get(language)
        if not model_name:
            logger.warning(f"No spaCy model found for language: {language}")
            return None
        
        try:
            _nlp_models[language] = spacy.load(model_name)
            logger.info(f"Loaded spaCy model: {model_name}")
        except Exception as e:
            logger.error(f"Error loading spaCy model {model_name}: {e}")
            return None
    
    return _nlp_models[language]

def get_lemma(word: str, language: str = 'english') -> Tuple[str, str]:
    """
    Get the lemma of a word in the specified language.
    
    Args:
        word: The word to lemmatize
        language: The language of the word
        
    Returns:
        A tuple of (lemma, pos_tag) where pos_tag is the part of speech tag
    """
    if not word or not word.strip():
        return word, ''
    
    nlp = get_nlp(language)
    if not nlp:
        # Fallback: return lowercase word if no model is available
        return word.lower(), 'UNKNOWN'
    
    try:
        doc = nlp(word)
        if not doc:
            return word.lower(), 'UNKNOWN'
            
        token = doc[0]  # Get the first (and only) token
        return token.lemma_.lower(), token.pos_
    except Exception as e:
        logger.error(f"Error lemmatizing word '{word}': {e}")
        return word.lower(), 'UNKNOWN'

def process_text(text: str, language: str = 'english') -> List[Dict]:
    """
    Process a text and return a list of words with their lemmas and POS tags.
    
    Args:
        text: The text to process
        language: The language of the text
        
    Returns:
        A list of dictionaries, each containing 'text', 'lemma', and 'pos'
    """
    if not text or not text.strip():
        return []
    
    nlp = get_nlp(language)
    if not nlp:
        # Fallback: return words as-is with basic processing
        return [{'text': word, 'lemma': word.lower(), 'pos': 'UNKNOWN'} 
               for word in text.split()]
    
    try:
        doc = nlp(text)
        return [
            {
                'text': token.text,
                'lemma': token.lemma_.lower(),
                'pos': token.pos_,
                'is_alpha': token.is_alpha,
                'is_stop': token.is_stop
            }
            for token in doc
            if not token.is_space and not token.is_punct
        ]
    except Exception as e:
        logger.error(f"Error processing text: {e}")
        return []

def extract_vocabulary(text: str, language: str = 'english') -> Dict[str, Dict]:
    """
    Extract unique lemmas from a text with their frequencies and example sentences.
    
    Args:
        text: The text to process
        language: The language of the text
        
    Returns:
        A dictionary mapping lemmas to their information
    """
    processed = process_text(text, language)
    vocab = {}
    
    for token in processed:
        if not token['is_alpha'] or token['is_stop']:
            continue
            
        lemma = token['lemma']
        if lemma not in vocab:
            vocab[lemma] = {
                'frequency': 0,
                'pos': token['pos'],
                'examples': set(),
                'original_forms': set()
            }
        
        vocab[lemma]['frequency'] += 1
        vocab[lemma]['original_forms'].add(token['text'].lower())
        
        # Add context (surrounding words) as example
        context = ' '.join(t['text'] for t in processed[max(0, processed.index(token)-2):processed.index(token)+3])
        vocab[lemma]['examples'].add(context)
    
    # Convert sets to lists for JSON serialization
    for lemma in vocab:
        vocab[lemma]['examples'] = list(vocab[lemma]['examples'])[:3]  # Keep up to 3 examples
        vocab[lemma]['original_forms'] = list(vocab[lemma]['original_forms'])
    
    return vocab
