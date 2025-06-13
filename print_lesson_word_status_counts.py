from extensions import db
from app import app
from vocab_utils import get_words_for_readability

with app.app_context():
    Language = db.Model.registry._class_registry.get("Language")
    Lesson = db.Model.registry._class_registry.get("Lesson")

    print("Word Status Counts by Lesson:")
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
            words = get_words_for_readability(text, lang.id)
            status_counts = {i: 0 for i in range(7)}  # 0-6
            ignored = 0
            for w in words:
                if w.get('ignored'):
                    ignored += 1
                else:
                    status = w.get('status', 0)
                    if status in status_counts:
                        status_counts[status] += 1
            print(f"  Lesson: {title}")
            print(f"    Blue (0): {status_counts[0]}")
            for lvl in range(1, 7):
                print(f"    Level {lvl}: {status_counts[lvl]}")
            print(f"    Ignored: {ignored}")
