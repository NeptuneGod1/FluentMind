import os
import sys

# List of diagnostic scripts to remove
DIAGNOSTIC_SCRIPTS = [
    'simple_diagnostic.py',
    'reset_language_status.py',
    'print_readability_scores.py',
    'print_lesson_word_status_surface.py',
    'print_lesson_word_status_counts.py',
    'print_lesson_readability_surface.py',
    'check_db.py',
    'check_columns.py',
    'backfill_word_counts.py',
    'add_columns.py',
    'check_italian_language.py',
    'check_italian.py',
    'check_db_structure.py',
    'check_language_setup.py',
    'check_lessons.py',
    'fix_italian_status.py',
    'fix_italian.py',
    'direct_fix.py',
    'clear_db_history.py',
    'inspect_config.py',
    'fix_media_url.py',
    'simple_fix.py',
    'minimal_test.py',
    'test_readability.py',
    'test_db.py',
    'update_lesson_readability_surface.py',
    'check_paths.py',
    'test_script.py',
    'trigger_backfill.py'  # Keep this if you might need it for future backfills
]

def cleanup_scripts():
    removed = []
    not_found = []
    
    for script in DIAGNOSTIC_SCRIPTS:
        if os.path.exists(script):
            try:
                os.remove(script)
                removed.append(script)
            except Exception as e:
                print(f"Error removing {script}: {e}")
        else:
            not_found.append(script)
    
    return removed, not_found

if __name__ == "__main__":
    print("Cleaning up diagnostic scripts...")
    removed, not_found = cleanup_scripts()
    
    if removed:
        print("\nSuccessfully removed:")
        for script in removed:
            print(f"- {script}")
    
    if not_found:
        print("\nNot found (already removed or never existed):")
        for script in not_found:
            print(f"- {script}")
    
    print("\nCleanup complete!")
    print("\nNote: The cleanup script will now delete itself.")
    
    # Self-delete the cleanup script
    try:
        os.remove(__file__)
        print("Cleanup script removed successfully.")
    except Exception as e:
        print(f"Error removing cleanup script: {e}")
