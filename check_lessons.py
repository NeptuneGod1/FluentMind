import sqlite3
from datetime import datetime

def check_lessons():
    db_path = 'app.db'
    
    try:
        # Connect to the database
        conn = sqlite3.connect(db_path)
        conn.row_factory = sqlite3.Row  # Enable column access by name
        cursor = conn.cursor()
        
        # Get all lessons with their language and word count info
        cursor.execute("""
            SELECT l.id, l.title, l.word_count, l.created_at, 
                   lang.name as language_name, lang.spacy_model_status
            FROM lesson l
            JOIN language lang ON l.language_id = lang.id
            WHERE lang.name IN ('Russian', 'Italian')
            ORDER BY l.created_at DESC
        """)
        
        lessons = cursor.fetchall()
        
        print("\n=== Lessons in Russian and Italian ===")
        print("ID\tWord Count\tLanguage\tStatus\tCreated At\tTitle")
        print("-" * 80)
        
        for lesson in lessons:
            created_at = datetime.strptime(lesson['created_at'], '%Y-%m-%d %H:%M:%S.%f') \
                        if lesson['created_at'] else 'N/A'
            print(f"{lesson['id']}\t"
                  f"{lesson['word_count'] or 'N/A'}\t\t"
                  f"{lesson['language_name']}\t"
                  f"{lesson['spacy_model_status']}\t"
                  f"{created_at}\t"
                  f"{lesson['title'][:30]}{'...' if len(lesson['title']) > 30 else ''}")
        
        # Check if there are any NULL word counts
        cursor.execute("""
            SELECT COUNT(*) as null_word_count
            FROM lesson
            WHERE word_count IS NULL
        """)
        null_count = cursor.fetchone()['null_word_count']
        print(f"\nTotal lessons with NULL word_count: {null_count}")
        
        # Check the schema to see if word_count is nullable
        cursor.execute("PRAGMA table_info(lesson)")
        columns = cursor.fetchall()
        word_count_col = next((col for col in columns if col['name'] == 'word_count'), None)
        if word_count_col:
            print(f"\nword_count column info:")
            print(f"Name: {word_count_col['name']}")
            print(f"Type: {word_count_col['type']}")
            print(f"Nullable: {'YES' if word_count_col['notnull'] == 0 else 'NO'}")
            print(f"Default: {word_count_col['dflt_value']}")
        
    except sqlite3.Error as e:
        print(f"\n❌ Database error: {e}")
    except Exception as e:
        print(f"\n❌ Unexpected error: {e}")
    finally:
        if 'conn' in locals():
            conn.close()

if __name__ == "__main__":
    print("Checking lessons in the database...")
    check_lessons()
