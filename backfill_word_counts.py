import sqlite3
import sys
from datetime import datetime

def count_words(text):
    """Simple word count function that matches the one in app.py"""
    if not text:
        return 0
    # Split on any whitespace and filter out empty strings
    return len([word for word in text.split() if word.strip()])

def backfill_word_counts():
    db_path = 'app.db'
    
    try:
        # Connect to the database
        conn = sqlite3.connect(db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        print("=== Backfilling Word Counts ===")
        
        # Find lessons with NULL or 0 word_count
        cursor.execute("""
            SELECT id, text_content, word_count 
            FROM lesson 
            WHERE word_count IS NULL OR word_count = 0
        """)
        
        lessons = cursor.fetchall()
        
        if not lessons:
            print("No lessons need word count backfilling.")
            return
        
        print(f"Found {len(lessons)} lessons with missing or zero word count.")
        print("Updating word counts...")
        
        updated_count = 0
        for lesson in lessons:
            word_count = count_words(lesson['text_content'])
            if word_count > 0:  # Only update if we got a valid word count
                cursor.execute("""
                    UPDATE lesson 
                    SET word_count = ? 
                    WHERE id = ?
                """, (word_count, lesson['id']))
                updated_count += 1
        
        conn.commit()
        print(f"Successfully updated word counts for {updated_count} lessons.")
        
        # Verify the update
        cursor.execute("""
            SELECT COUNT(*) as remaining 
            FROM lesson 
            WHERE word_count IS NULL OR word_count = 0
        """)
        remaining = cursor.fetchone()['remaining']
        print(f"Lessons still missing word counts: {remaining}")
        
    except sqlite3.Error as e:
        print(f"\n❌ Database error: {e}")
        if 'conn' in locals():
            conn.rollback()
        return 1
    except Exception as e:
        print(f"\n❌ Unexpected error: {e}")
        if 'conn' in locals():
            conn.rollback()
        return 1
    finally:
        if 'conn' in locals():
            conn.close()
    
    return 0

if __name__ == "__main__":
    print("Starting word count backfill...")
    sys.exit(backfill_word_counts())
