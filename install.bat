@echo off
REM ModernLWT3 - Robust one-click installer for Windows

:: Set console title
title ModernLWT3 - Installation

:: Enable delayed expansion for variables in loops
setlocal enabledelayedexpansion

:: Set color for better visibility
color 0A

:: Display header
echo ===============================================
echo  ModernLWT3 - Language Learning with Technology
echo ===============================================
echo.

echo This will install the following components:
echo 1. Python 3.9+ (if not installed)
echo 2. Python virtual environment
echo 3. Required Python packages
echo 4. Language models for 20+ languages
echo.

:: Function to check if a command exists
:command_exists
    where "%~1" >nul 2>&1
    exit /b %errorlevel%

:: Check for Python installation
echo [1/4] Checking for Python installation...
set PYTHON_CMD=

:: Try python, then python3, then py launcher
for %%i in (python python3 py) do (
    if "!PYTHON_CMD!"=="" (
        call :command_exists %%i
        if !errorlevel! equ 0 (
            set PYTHON_CMD=%%i
        )
    )
)

if "%PYTHON_CMD%"=="" (
    echo [ERROR] Python 3.9+ is not installed or not in your PATH.
    echo Please install Python from https://www.python.org/downloads/
    echo Make sure to check "Add Python to PATH" during installation.
    pause
    exit /b 1
)

echo [OK] Found Python: %PYTHON_CMD%

:: Verify Python version
echo [2/4] Verifying Python version...
%PYTHON_CMD% -c "import sys; exit(0 if sys.version_info >= (3, 9) else 1)"
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Python 3.9 or higher is required.
    echo Detected version:
    %PYTHON_CMD% --version
    pause
    exit /b 1
)

:: Ensure pip is installed
echo [3/4] Setting up pip...
%PYTHON_CMD% -m ensurepip --default-pip >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo Installing pip...
    curl -s -o get-pip.py https://bootstrap.pypa.io/get-pip.py
    if %ERRORLEVEL% NEQ 0 (
        echo [ERROR] Failed to download pip installer.
        pause
        exit /b 1
    )
    %PYTHON_CMD% get-pip.py --user
    if %ERRORLEVEL% NEQ 0 (
        echo [ERROR] Failed to install pip. Please install it manually.
        del get-pip.py >nul 2>&1
        pause
        exit /b 1
    )
    del get-pip.py >nul 2>&1
)

:: Update pip to the latest version
%PYTHON_CMD% -m pip install --upgrade pip --user >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [WARNING] Failed to update pip. Continuing with existing version.
)

:: Create virtual environment
echo [4/4] Setting up virtual environment...
if not exist venv (
    %PYTHON_CMD% -m venv venv
    if %ERRORLEVEL% NEQ 0 (
        echo [ERROR] Failed to create virtual environment.
        pause
        exit /b 1
    )
)

:: Activate virtual environment
call venv\Scripts\activate
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Failed to activate virtual environment.
    pause
    exit /b 1
)

:: Install required packages
echo.
echo ===============================================
echo Installing required packages...
echo ===============================================
%PYTHON_CMD% -m pip install --upgrade pip setuptools wheel
%PYTHON_CMD% -m pip install --upgrade --prefer-binary pandas
%PYTHON_CMD% -m pip install --prefer-binary -r requirements.txt

:: Install spaCy if not already installed
%PYTHON_CMD% -m pip install -U spacy

:: Download language models
echo.
echo ===============================================
echo Downloading language models...
echo This may take a while depending on your internet connection.
echo ===============================================

:: List of models to download
set "SPACY_MODELS=en_core_web_sm zh_core_web_sm es_core_news_sm fr_core_news_sm de_core_news_sm ru_core_news_sm ja_core_news_sm pt_core_news_sm it_core_news_sm nl_core_news_sm uk_core_news_sm sv_core_news_sm sl_core_news_sm ro_core_news_sm lt_core_news_sm el_core_news_sm fi_core_news_sm da_core_news_sm hr_core_news_sm ca_core_news_sm xx_ent_wiki_sm"

:: Download each model
for %%m in (%SPACY_MODELS%) do (
    echo [DOWNLOAD] %%m
    %PYTHON_CMD% -m spacy download %%m --no-deps
    if !ERRORLEVEL! NEQ 0 (
        echo [WARNING] Failed to download %%m
    ) else (
        echo [SUCCESS] Successfully downloaded %%m
    )
    echo.
)

:: Create a simple test script to verify installation
echo import spacy > test_models.py
echo "print('Testing spaCy models...')" >> test_models.py
for %%m in (%SPACY_MODELS%) do (
    echo try: >> test_models.py
    echo "    nlp = spacy.load('%%m')" >> test_models.py
    echo "    print(f'[OK] Successfully loaded: %%m')" >> test_models.py
    echo except Exception as e: >> test_models.py
    echo "    print(f'[ERROR] Failed to load %%m: {str(e)}')" >> test_models.py
)

echo.
echo ===============================================
echo Verifying model installation...
echo ===============================================
%PYTHON_CMD% test_models.py
del test_models.py

echo.
echo ===============================================
echo Installation complete!
echo ===============================================
echo.
echo To start the application, run:
echo    1. venv\Scripts\activate
echo    2. python app.py
echo.
echo Or on Windows, you can use the start.bat file.
echo.
pause