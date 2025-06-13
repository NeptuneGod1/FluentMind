@echo off
REM ModernLWT3 - Robust one-click installer for Windows

REM Try python, then python3
where python >nul 2>&1
IF %ERRORLEVEL% EQU 0 (
    set PYTHON_CMD=python
) ELSE (
    where python3 >nul 2>&1
    IF %ERRORLEVEL% EQU 0 (
        set PYTHON_CMD=python3
    ) ELSE (
        echo Python 3.9+ is not installed or not in your PATH.
        echo Please install Python from https://www.python.org/downloads/ and add it to your PATH.
        pause
        exit /b 1
    )
)

REM Create virtual environment if it doesn't exist
IF NOT EXIST venv (
    %PYTHON_CMD% -m venv venv
)

REM Activate virtual environment
call venv\Scripts\activate

REM Upgrade pip, setuptools, wheel
%PYTHON_CMD% -m pip install --upgrade pip setuptools wheel

REM Install dependencies (prefer binary wheels)
%PYTHON_CMD% -m pip install --prefer-binary -r requirements.txt


echo Installation complete! You can now run the app using run.bat
pause
