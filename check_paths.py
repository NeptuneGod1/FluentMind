import sys
import os

print("Python Path:")
for path in sys.path:
    print(f"- {path}")

print("\nCurrent Working Directory:")
print(f"- {os.getcwd()}")

print("\nFiles in current directory:")
for f in os.listdir('.'):
    if f.endswith('.py'):
        print(f"- {f}")

print("\nTrying to import app...")
try:
    from app import app
    print("Successfully imported app!")
    
    print("\nApp configuration:")
    for key, value in app.config.items():
        print(f"{key} = {value}")
    
except Exception as e:
    print(f"Error importing app: {e}")
    
print("\nTrying to import models...")
try:
    from models import db
    print("Successfully imported models!")
except Exception as e:
    print(f"Error importing models: {e}")
