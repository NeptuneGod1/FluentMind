from app import app, db, Lesson
import os
from flask import url_for, request

# Ensure we have an application context
with app.app_context():
    # And potentially a request context if url_for needs it for current_app.url_for
    with app.test_request_context():
        lesson = db.session.get(Lesson, 3)

        if lesson and lesson.media_url:
            # Ensure the URL is properly formatted for web (forward slashes)
            # It might also have URL encoding for backslashes (%5C), so replace that too
            fixed_url = lesson.media_url.replace('\\', '/').replace('%5C', '/')

            # Reconstruct the static URL correctly
            # Extract the path after /static/ to reconstruct with url_for
            if fixed_url.startswith('/static/'):
                relative_path = fixed_url[len('/static/'):]
                # Re-generate the URL using url_for to ensure Flask handles it
                lesson.media_url = url_for('static', filename=relative_path)
            else:
                # If it doesn't start with /static/, assume it's a direct path that needs fixing
                # This case might indicate an issue, but we'll try to fix path separators
                lesson.media_url = fixed_url # Just fix slashes if not a static URL

            db.session.commit()
            print(f"Updated media_url for Lesson 3: {lesson.media_url}")
        else:
            print("No media URL to update for Lesson 3 or lesson not found.") 