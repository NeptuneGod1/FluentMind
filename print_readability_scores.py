from extensions import db
from app import app

with app.app_context():
    Language = db.Model.registry._class_registry.get("Language")
    Lesson = db.Model.registry._class_registry.get("Lesson")
    Story = db.Model.registry._class_registry.get("Story")

    found_any = False

    print("Readability Scores by Language (Lessons):")
    for lang in Language.query.order_by(Language.name):
        lessons = Lesson.query.filter_by(language_id=lang.id).all()
        print(f"\nLanguage: {lang.name} (Lessons: {len(lessons)})")
        if not lessons:
            print("  No lessons found.")
            continue
        found_any = True
        for lesson in lessons:
            score = lesson.readability_score
            title = getattr(lesson, 'title', f"Lesson {lesson.id}")
            score_str = f"{score:.5f}" if score is not None else "None"
            print(f"  Lesson: {title}\n    Score: {score_str}")

    print("\nReadability Scores by Language (Stories):")
    for lang in Language.query.order_by(Language.name):
        stories = Story.query.filter_by(language_id=lang.id).all()
        print(f"\nLanguage: {lang.name} (Stories: {len(stories)})")
        if not stories:
            print("  No stories found.")
            continue
        found_any = True
        for story in stories:
            score = story.readability_score
            title = getattr(story, 'title', f"Story {story.id}")
            score_str = f"{score:.5f}" if score is not None else "None"
            print(f"  Story: {title}\n    Score: {score_str}")

    if not found_any:
        print("No lessons or stories found in the database.")
