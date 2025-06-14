print("Testing script execution...")
print("This is a test script to verify Python execution.")

# Try to import required modules
try:
    from app import app
    print("Successfully imported app from app.py")
except Exception as e:
    print(f"Error importing app: {e}")

# Check if we can access the database
try:
    from models import db
    print("Successfully imported db from models.py")
    
    # Try to create an app context
    with app.app_context():
        print("Successfully created app context")
        
        # Try a simple database query
        from models import Language
        count = Language.query.count()
        print(f"Found {count} languages in the database")
        
        # List all languages
        print("\nLanguages in database:")
        for lang in Language.query.all():
            print(f"- {lang.name} (ID: {lang.id}, Code: {lang.code or 'N/A'})")
            
except Exception as e:
    print(f"Database error: {e}")

print("\nScript completed.")
