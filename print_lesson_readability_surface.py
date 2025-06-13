from extensions import db
from app import app
import re

# Use the same weights as in vocab_utils.py
STATUS_WEIGHTS = {
    0: 0.00,  # Unknown
    1: 0.10,  # Barely recalled
    2: 0.25,  # Recognised, shaky
    3: 0.45,  # Understand in context
    4: 0.70,  # Recall w/out context
    5: 0.90,  # Solidly known
    6: 1.00,  # Fully known
}

with app.app_context():
    Language = db.Model.registry._class_registry.get("Language")
    Lesson = db.Model.registry._class_registry.get("Lesson")
    VocabTerm = db.Model.registry._class_registry.get("VocabTerm")

    def get_word_status(word, language_id):
        vocab = VocabTerm.query.filter_by(language_id=language_id, term=word.lower()).first()
        if vocab:
            return vocab.status
        return 0

    def compute_readability_surface(words):
        total_weighted = 0
        count = 0
        for status in words:
            weight = STATUS_WEIGHTS.get(status, 0.0)
            total_weighted += weight
            count += 1
        if count == 0:
            return 100.0
        return (total_weighted / count) * 100

    print("Lesson Readability Scores (Surface Form):")
    for lang in Language.query.order_by(Language.name):
        lessons = Lesson.query.filter_by(language_id=lang.id).all()
        if not lessons:
            continue
        print(f"\nLanguage: {lang.name}")
        for lesson in lessons:
            title = getattr(lesson, 'title', f"Lesson {lesson.id}")
            text = getattr(lesson, 'text_content', None)
            if not text:
                print(f"  Lesson: {title}\n    No text content.")
                continue
            words = re.findall(r"\b\w+\b", text)
            statuses = [get_word_status(word, lang.id) for word in words]
            readability = compute_readability_surface(statuses)
            print(f"  Lesson: {title}")
            print(f"    Readability: {readability:.5f}%")
            print(f"    Word count: {len(words)}")
