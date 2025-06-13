@echo off
REM ModernLWT3 - One-click installer for Windows

REM Check for Python
python --version >nul 2>&1
IF %ERRORLEVEL% NEQ 0 (
    echo Python is not installed. Please install Python 3.9+ from https://www.python.org/downloads/
    pause
    exit /b 1
)

REM Create virtual environment if it doesn't exist
IF NOT EXIST venv (
    python -m venv venv
)

REM Activate virtual environment
call venv\Scripts\activate

REM Upgrade pip
python -m pip install --upgrade pip

REM Install dependencies
pip install -r requirements.txt


echo Installation complete! You can now run the app using run.bat
pause
