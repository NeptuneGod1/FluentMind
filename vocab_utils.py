from __future__ import annotations
from datetime import datetime
from extensions import db
# Avoid circular import: import models inside functions when needed
from text_processor import get_lemma, process_text

# Helper to retrieve model classes lazily without importing app.py
def _get_model(name):
    return db.Model.registry._class_registry.get(name)

# CEFR level thresholds (in number of lemmas)
CEFR_THRESHOLDS = {
    'A1': 700,
    'A2': 1200,    # A2 starts at 701
    'B1': 2500,    # B1 starts at 1201
    'B2': 5000,    # B2 starts at 2501
    'C1': 10000,   # C1 starts at 5001
    'C2': 20000    # C2 starts at 10001
}

# Readability Status Weights (v1.0)
STATUS_WEIGHTS = {
    0: 0.00,  # Unknown
    1: 0.10,  # Barely recalled
    2: 0.25,  # Recognised, shaky
    3: 0.45,  # Understand in context
    4: 0.70,  # Recall w/out context
    5: 0.90,  # Solidly known
    6: 1.00,  # Fully known
    # Status 7 (Ignored) should be handled by `w.ignored` flag, not included here for weighting
}

def update_vocab_term(language_id: int, term: str, status: int = None, translation: str = None) -> VocabTerm:
    from app import VocabTerm  # Local import to avoid circular dependency
    """
    Update or create a vocabulary term with lemmatization.
    
    Args:
        language_id: ID of the language
        term: The term to add/update
        status: The status to set (if None, keeps existing status)
        translation: The translation (if None, keeps existing translation)
        
    Returns:
        The created or updated VocabTerm
    """
    if not term or not term.strip():
        return None
        
    # Get or create the term
    vocab_term = VocabTerm.query.filter_by(
        language_id=language_id,
        term=term.strip().lower()
    ).first()
    
    # Process the term to get lemma and POS
    lemma, pos = get_lemma(term)
    
    if not vocab_term:
        # Create new term
        vocab_term = VocabTerm(
            language_id=language_id,
            term=term.strip().lower(),
            lemma=lemma,
            status=status if status is not None else 0,  # Default to unknown status
            translation=translation or "",
            state="new"
        )
        db.session.add(vocab_term)
    else:
        # Update existing term
        if status is not None:
            vocab_term.status = status
        if translation is not None:
            vocab_term.translation = translation
        
        # If the term was previously unknown and now is known, update the lemma
        if vocab_term.status < 6 and status == 6:  # If changing to known status
            vocab_term.lemma = lemma
    
    try:
        db.session.commit()
        return vocab_term
    except Exception as e:
        db.session.rollback()
        print(f"Error updating vocab term: {e}")
        return None

def get_known_lemmas_count(language_id: int) -> int:
    VocabTerm = _get_model('VocabTerm')
    """
    Get the count of unique known lemmas for a language.
    Known status is 6 (STATUS_KNOWN).
    """
    return db.session.query(VocabTerm.lemma).filter(
        VocabTerm.language_id == language_id,
        VocabTerm.status == 6,  # STATUS_KNOWN
        VocabTerm.lemma.isnot(None)
    ).distinct().count()

def get_cefr_progress(language_id: int) -> dict:
    VocabTerm = _get_model('VocabTerm')
    total_known = get_known_lemmas_count(language_id)
    sorted_thresholds = sorted(CEFR_THRESHOLDS.items(), key=lambda item: item[1])
    current_level = 'Pre-A1'
    level_start = 0
    levels = {}
    prev_threshold = 0
    for level, threshold in sorted_thresholds:
        # Calculate how many lemmas are in this level
        level_range = threshold - prev_threshold
        if total_known > prev_threshold:
            # How many lemmas are in this level?
            in_level = min(total_known, threshold) - prev_threshold
            percent = (in_level / level_range) * 100 if level_range > 0 else 100
        else:
            percent = 0
        levels[level] = {'percent': percent}
        if total_known <= threshold and current_level == 'Pre-A1':
            current_level = level
            level_start = prev_threshold
            level_end = threshold
        prev_threshold = threshold
    # If user is beyond the highest threshold
    if total_known > sorted_thresholds[-1][1]:
        current_level = sorted_thresholds[-1][0]
        level_start = sorted_thresholds[-2][1]
        level_end = sorted_thresholds[-1][1]
    lemmas_in_level = total_known - level_start
    level_range = level_end - level_start
    progress_percent = (lemmas_in_level / level_range) * 100 if level_range > 0 else 100
    return {
        'levels': levels,
        'total_known_lemmas': total_known,
        'current_level': current_level,
        'current_level_percentage': progress_percent,
    }

def update_cefr_levels(language_id: int):
    VocabTerm = _get_model('VocabTerm')
    """
    Update the CEFR levels for all known lemmas in a language.
    This should be called periodically to ensure levels are up to date.
    """
    # Get all known lemmas for this language
    known_lemmas = db.session.query(VocabTerm.id, VocabTerm.lemma).filter(
        VocabTerm.language_id == language_id,
        VocabTerm.status == 6,  # STATUS_KNOWN
        VocabTerm.lemma.isnot(None)
    ).distinct(VocabTerm.lemma).all()
    
    # Sort lemmas by frequency or other criteria if needed
    # For now, we'll just assign levels based on the order they were learned
    for i, (term_id, lemma) in enumerate(known_lemmas, 1):
        # Determine CEFR level based on position in the list
        if i <= CEFR_THRESHOLDS['A1']:
            cefr_level = 'A1'
        elif i <= CEFR_THRESHOLDS['A2']:
            cefr_level = 'A2'
        elif i <= CEFR_THRESHOLDS['B1']:
            cefr_level = 'B1'
        elif i <= CEFR_THRESHOLDS['B2']:
            cefr_level = 'B2'
        elif i <= CEFR_THRESHOLDS['C1']:
            cefr_level = 'C1'
        else:
            cefr_level = 'C2'
        
        # Update the term's CEFR level
        db.session.query(VocabTerm).filter(
            VocabTerm.id == term_id
        ).update({'cefr_level': cefr_level})
    
    try:
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        print(f"Error updating CEFR levels: {e}")

def process_text_for_vocab(text: str, language_id: int) -> dict:
    VocabTerm = _get_model('VocabTerm')
    Language = _get_model('Language')
    """
    Process a text and return vocabulary information.
    
    Returns:
        {
            'total_words': int,
            'unique_lemmas': int,
            'known_lemmas': int,
            'unknown_lemmas': list,
            'known_percentage': float
        }
    """
    if not text or not text.strip():
        return {
            'total_words': 0,
            'unique_lemmas': 0,
            'known_lemmas': 0,
            'unknown_lemmas': [],
            'known_percentage': 0
        }
    
    # Get language name for text processing
    language = Language.query.get(language_id)
    if not language:
        return {
            'total_words': 0,
            'unique_lemmas': 0,
            'known_lemmas': 0,
            'unknown_lemmas': [],
            'known_percentage': 0
        }
    
    # Process the text
    processed = process_text(text, language.name.lower())
    if not processed:
        return {
            'total_words': 0,
            'unique_lemmas': 0,
            'known_lemmas': 0,
            'unknown_lemmas': [],
            'known_percentage': 0
        }
    
    # Get unique lemmas
    lemmas = set()
    unknown_lemmas = []
    
    for token in processed:
        if not token['is_alpha'] or token['is_stop']:
            continue
            
        lemma = token['lemma']
        if lemma not in lemmas:
            lemmas.add(lemma)
            
            # Check if this lemma is known
            known = db.session.query(VocabTerm).filter(
                VocabTerm.language_id == language_id,
                VocabTerm.lemma == lemma,
                VocabTerm.status == 6  # STATUS_KNOWN
            ).first()
            
            if not known:
                unknown_lemmas.append({
                    'lemma': lemma,
                    'original': token['text'],
                    'pos': token['pos']
                })
    
    known_count = len(lemmas) - len(unknown_lemmas)
    
    return {
        'total_words': len(processed),
        'unique_lemmas': len(lemmas),
        'known_lemmas': known_count,
        'unknown_lemmas': unknown_lemmas,
        'known_percentage': (known_count / len(lemmas)) * 100 if lemmas else 0
    }

def compute_readability(words):
    """
    Compute a readability score for a passage based on word familiarity.

    Each word has:
      - status: an integer 0–6
          0 = brand-new/unknown
          1 = level-1 (red)
          2 = level-2
          3 = level-3
          4 = level-4
          5 = level-5
          6 = fully known
      - ignored: boolean flag for words to skip

    Familiarity fᵢ = status_i / 6.0  
    Readability = (1 / N) * Σ fᵢ  
      where N = count of non-ignored words  

    Returns:
      A float 0.0–100.0 (percentage).  
      0% = all words unknown; 100% = all words fully known.
    """
    total_weighted_familiarity = 0
    count = 0

    for w in words:
        if w['ignored']:
            continue
        # w.status is assumed 0…6, map to defined weights
        status = w['status']
        weight = STATUS_WEIGHTS.get(status, 0.0) # Default to 0.0 if status is unexpected
        total_weighted_familiarity += weight
        count += 1

    if count == 0:
        return 100.0  # nothing to read = "fully readable"

    # Readability = (Sum of weights) / (Count of non-ignored words)
    # Then convert to percentage
    return (total_weighted_familiarity / count) * 100

def get_words_for_readability(text: str, language_id: int) -> list:
    VocabTerm = _get_model('VocabTerm')
    Language = _get_model('Language')
    from app import get_spacy_model # Import get_spacy_model from app

    words_data = []

    if not text or not text.strip():
        return words_data

    language = Language.query.get(language_id)
    if not language or language.spacy_model_status != "available":
        print(f"Warning: SpaCy model not available for language '{language.name}'. Cannot calculate readability.")
        return words_data # Return empty if model not available

    nlp = get_spacy_model(language.name)
    if not nlp:
        print(f"Warning: SpaCy model failed to load for language '{language.name}'. Cannot calculate readability.")
        return words_data

    doc = nlp(text)
    # Collect all unique lemmas from the text for a single database query
    lemmas_in_text = set()
    for token in doc:
        if token.is_alpha and not token.is_stop:
            lemma = token.lemma_.lower()
            if lemma != "-pron-": # Skip generic pronoun lemmas
                lemmas_in_text.add(lemma)

    # Query existing vocab terms for the lemmas in this text
    existing_vocab = {}
    if lemmas_in_text:
        vocab_entries = VocabTerm.query.filter(
            VocabTerm.language_id == language_id,
            VocabTerm.lemma.in_(list(lemmas_in_text))
        ).all()
        existing_vocab = {entry.lemma: entry for entry in vocab_entries}

    for token in doc:
        if token.is_alpha:
            lemma = token.lemma_.lower()
            # Use token.is_stop to determine if it should be 'ignored'
            is_ignored = token.is_stop or (lemma == "-pron-") # Also ignore generic pronouns
            
            status = 0 # Default to unknown
            if lemma in existing_vocab:
                status = existing_vocab[lemma].status
            
            words_data.append({'status': status, 'ignored': is_ignored})

    return words_data
