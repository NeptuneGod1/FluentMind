@echo off
REM ModernLWT3 - One-click runner for Windows

REM Activate virtual environment
call venv\Scripts\activate

REM Start the app and open browser
start "" http://127.0.0.1:5000/
python app.py

pause
