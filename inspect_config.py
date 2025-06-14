import os
import sys

def print_section(title):
    print("\n" + "=" * 80)
    print(f" {title} ".center(80, "="))
    print("=" * 80)

print_section("SYSTEM INFORMATION")
print(f"Python: {sys.version}")
print(f"Working Directory: {os.getcwd()}")
print(f"Environment: {sys.prefix}")

print_section("FILES IN DIRECTORY")
files = os.listdir('.')
for f in files:
    if f.endswith(('.py', '.db', '.txt', '.bat')):
        print(f"- {f}")

print_section("ATTEMPTING TO IMPORT FLASK")
try:
    from flask import Flask
    print("✓ Flask is installed")
    print(f"Flask version: {Flask.__version__ if hasattr(Flask, '__version__') else 'Unknown'}")
except ImportError as e:
    print(f"✗ Flask is not installed: {e}")

print_section("ATTEMPTING TO IMPORT SQLALCHEMY")
try:
    from sqlalchemy import create_engine, inspect
    from sqlalchemy.orm import scoped_session, sessionmaker
    from sqlalchemy.ext.declarative import declarative_base
    print("✓ SQLAlchemy is installed")
    
    # Try to connect to the database
    db_path = os.path.join(os.getcwd(), 'app.db')
    if os.path.exists(db_path):
        print(f"\nFound database at: {db_path}")
        print(f"Size: {os.path.getsize(db_path) / (1024*1024):.2f} MB")
        
        try:
            engine = create_engine(f'sqlite:///{db_path}')
            inspector = inspect(engine)
            tables = inspector.get_table_names()
            print(f"\nDatabase tables: {', '.join(tables) if tables else 'No tables found'}")
            
            if 'language' in tables:
                print("\nLanguage table contents:")
                with engine.connect() as conn:
                    result = conn.execute('SELECT * FROM language')
                    for row in result:
                        print(f"  {row}")
            
        except Exception as e:
            print(f"Error connecting to database: {e}")
    else:
        print(f"Database not found at: {db_path}")
        
except ImportError as e:
    print(f"✗ SQLAlchemy is not installed: {e}")

print_section("CHECKING FOR SPACY")
try:
    import spacy
    print("✓ spaCy is installed")
    print(f"spaCy version: {spacy.__version__}")
    
    # Check for Italian model
    print("\nChecking for Italian model...")
    try:
        nlp = spacy.load('it_core_news_sm')
        print("✓ Italian model (it_core_news_sm) is installed")
        print(f"Pipeline components: {', '.join(nlp.pipe_names)}")
    except Exception as e:
        print(f"✗ Italian model (it_core_news_sm) is not installed: {e}")
        print("  Install it with: python -m spacy download it_core_news_sm")
    
except ImportError as e:
    print(f"✗ spaCy is not installed: {e}")
    print("  Install it with: pip install -U spacy")
