from extensions import db
from app import app
import re

with app.app_context():
    Language = db.Model.registry._class_registry.get("Language")
    Lesson = db.Model.registry._class_registry.get("Lesson")
    VocabTerm = db.Model.registry._class_registry.get("VocabTerm")

    def get_word_status(word, language_id):
        # Look up the exact surface form in vocab for this language
        vocab = VocabTerm.query.filter_by(language_id=language_id, term=word.lower()).first()
        if vocab:
            return vocab.status
        return 0  # Unknown/blue if not found

    print("Word Status Counts by Lesson (Surface Form):")
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
            # Split on words (keep only alphabetic words)
            words = re.findall(r"\b\w+\b", text)
            print(f"  Lesson: {title}")
            print(f"    Text sample: {text[:100]!r}")
            print(f"    Word count: {len(words)}")
            status_counts = {i: 0 for i in range(7)}  # 0-6
            for word in words:
                status = get_word_status(word, lang.id)
                if status in status_counts:
                    status_counts[status] += 1
            print(f"    Blue (0): {status_counts[0]}")
            for lvl in range(1, 7):
                print(f"    Level {lvl}: {status_counts[lvl]}")
