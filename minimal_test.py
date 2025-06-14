import sys
import os

print("Minimal test script starting...")
print(f"Python version: {sys.version}")
print(f"Current working directory: {os.getcwd()}")
print("\nFiles in current directory:")
for f in os.listdir('.'):
    if f.endswith(('.py', '.db')):
        print(f"- {f}")

print("\nTrying to import sqlite3...")
try:
    import sqlite3
    print("✓ sqlite3 imported successfully")
    print(f"sqlite3 version: {sqlite3.version}")
    print(f"sqlite3.sqlite_version: {sqlite3.sqlite_version}")
except Exception as e:
    print(f"Error importing sqlite3: {e}")

print("\nScript completed.")
