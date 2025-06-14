@echo off
REM ModernLWT3 - Robust one-click installer for Windows

:: Set console title
title ModernLWT3 - Installation

:: Enable delayed expansion for variables in loops
setlocal enabledelayedexpansion

:: Set color for better visibility (green text on black background)
color 0A

:: Set error handling
set "ERROR_LEVEL=0"
set "LOG_FILE=install.log"

echo. > "%LOG_FILE%"

echo =============================================== >> "%LOG_FILE%"
echo  ModernLWT3 - Language Learning with Technology >> "%LOG_FILE%"
echo =============================================== >> "%LOG_FILE%"
echo. >> "%LOG_FILE%"

:display_header
cls
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
echo Installation log: %CD%\%LOG_FILE%
echo.

if "%1"=="--silent" goto silent_mode

:: Function to display a message and log it
:log_message
echo [%TIME%] %* >> "%LOG_FILE%"
if not "%1"=="--log-only" (
    echo %*
)
goto :eof

:silent_mode
shift
goto %1

:: Function to check if a command exists
:command_exists
    where "%~1" >nul 2>&1
    set "CMD_EXISTS=!errorlevel!"
    if !CMD_EXISTS! equ 0 (
        call :log_message --log-only "[DEBUG] Command found: %~1"
    ) else (
        call :log_message --log-only "[DEBUG] Command not found: %~1"
    )
    exit /b %CMD_EXISTS%

:: Check for Python installation
call :log_message [1/4] Checking for Python installation...
set PYTHON_CMD=

:: Try python, then python3, then py launcher
for %%i in (python python3 py) do (
    if "!PYTHON_CMD!"=="" (
        call :command_exists %%i
        if !errorlevel! equ 0 (
            set PYTHON_CMD=%%i
            call :log_message "Found Python command: %%i"
        )
    )
)

if "%PYTHON_CMD%"=="" (
    call :log_message "[ERROR] Python 3.9+ is not installed or not in your PATH."
    call :log_message "Please install Python from https://www.python.org/downloads/"
    call :log_message "Make sure to check \"Add Python to PATH\" during installation."
    
    echo.
    echo ===============================================
    echo [ERROR] Python 3.9+ is not installed or not in your PATH.
    echo Please install Python from https://www.python.org/downloads/
    echo Make sure to check "Add Python to PATH" during installation.
    echo.
    echo See %CD%\%LOG_FILE% for more details.
    echo ===============================================
    echo.
    pause
    exit /b 1
)

call :log_message "[OK] Found Python: %PYTHON_CMD%"

:: Verify Python version
call :log_message "[2/4] Verifying Python version..."
%PYTHON_CMD% -c "import sys; exit(0 if sys.version_info >= (3, 9) else 1)" 2>> "%LOG_FILE%"
if %ERRORLEVEL% NEQ 0 (
    call :log_message "[ERROR] Python 3.9 or higher is required."
    call :log_message "Detected version:"
    %PYTHON_CMD% --version 2>> "%LOG_FILE%"
    
    echo.
    echo ===============================================
    echo [ERROR] Python 3.9 or higher is required.
    echo Detected version:
    %PYTHON_CMD% --version
    echo.
    echo See %CD%\%LOG_FILE% for more details.
    echo ===============================================
    echo.
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

:: Create virtual environment if it doesn't exist
call :log_message "[3/4] Setting up virtual environment..."
if not exist "venv\" (
    call :log_message "Creating virtual environment..."
    %PYTHON_CMD% -m venv venv 2>> "%LOG_FILE%"
    if %ERRORLEVEL% NEQ 0 (
        call :log_message "[ERROR] Failed to create virtual environment."
        
        echo.
        echo ===============================================
        echo [ERROR] Failed to create virtual environment.
        echo Please check if you have sufficient permissions.
        echo.
        echo See %CD%\%LOG_FILE% for details.
        echo ===============================================
        echo.
        pause
        goto :error_exit
    ) else (
        call :log_message "Virtual environment created successfully."
    )
) else (
    call :log_message "Virtual environment already exists."
)

:: Activate virtual environment and install requirements
call :log_message "Activating virtual environment..."
call venv\Scripts\activate.bat
if %ERRORLEVEL% NEQ 0 (
    call :log_message "[ERROR] Failed to activate virtual environment."
    
    echo.
    echo ===============================================
    echo [ERROR] Failed to activate virtual environment.
    echo This might be due to missing or corrupted files.
    echo Try deleting the 'venv' folder and running the installer again.
    echo.
    echo See %CD%\%LOG_FILE% for more details.
    echo ===============================================
    echo.
    pause
    exit /b 1
)

:: Upgrade pip
call :log_message "Upgrading pip..."
python -m pip install --upgrade pip >> "%LOG_FILE%" 2>&1
if %ERRORLEVEL% NEQ 0 (
    call :log_message "[WARNING] Failed to upgrade pip. Continuing anyway..."
    echo [WARNING] Failed to upgrade pip. Installation will continue, but some features might not work correctly.
) else (
    call :log_message "Pip upgraded successfully."
)

:: Install required packages
call :log_message "Installing required packages..."
echo ===============================================
echo Installing required packages...
echo ===============================================
python -m pip install --upgrade pip setuptools wheel >> "%LOG_FILE%" 2>&1
python -m pip install --upgrade --prefer-binary pandas >> "%LOG_FILE%" 2>&1
python -m pip install --prefer-binary -r requirements.txt >> "%LOG_FILE%" 2>&1

:: Install spaCy if not already installed
call :log_message "Installing spaCy..."
python -m pip install -U spacy >> "%LOG_FILE%" 2>&1

:: Download language models
echo.
echo ===============================================
echo Downloading language models...
echo This may take a while depending on your internet connection.
echo ===============================================

:: List of language models to download (add more as needed)
set "MODELS=de_core_news_sm es_core_news_sm fr_core_news_sm it_core_news_sm nl_core_news_sm pt_core_news_sm ru_core_news_sm zh_core_web_sm xx_ent_wiki_sm"
set "TOTAL_MODELS=0"
set "SUCCESS_MODELS=0"

:: Count total models
for %%m in (%MODELS%) do set /a TOTAL_MODELS+=1

:: Download each model
set "CURRENT_MODEL=1"
for %%m in (%MODELS%) do (
    call :log_message "[!CURRENT_MODEL!/!TOTAL_MODELS!] Downloading %%m..."
    echo [!CURRENT_MODEL!/!TOTAL_MODELS!] Downloading %%m...
    
    python -m spacy download %%m --no-deps >> "%LOG_FILE%" 2>&1
    if !ERRORLEVEL! NEQ 0 (
        call :log_message "[WARNING] Failed to download %%m"
        echo [WARNING] Failed to download %%m
    ) else (
        call :log_message "[OK] Successfully downloaded %%m"
        echo [OK] Successfully downloaded %%m
        set /a SUCCESS_MODELS+=1
    )
    set /a CURRENT_MODEL+=1
)

:: Display completion message
call :log_message "Installation completed with !SUCCESS_MODELS! out of !TOTAL_MODELS! models downloaded successfully."
echo.
echo ===============================================
echo               INSTALLATION COMPLETE
echo ===============================================
echo.
if !SUCCESS_MODELS! LSS !TOTAL_MODELS! (
    echo [!] Some language models failed to download.
    echo     Successfully downloaded: !SUCCESS_MODELS! out of !TOTAL_MODELS! models.
    echo     Check %CD%\%LOG_FILE% for details.
) else (
    echo [✓] All language models downloaded successfully!
)
echo.
echo To start the application:
echo 1. Open a command prompt in this directory
echo 2. Run: venv\Scripts\activate
echo 3. Run: python app.py
echo.
echo The application will be available at: http://localhost:5000
echo.
echo For help or to report issues, please refer to the documentation.
echo ===============================================

:: Always wait for user input before closing
pause

goto :end_installation

:: Create a simple test script to verify installation
echo import spacy > test_models.py
echo "print('Testing spaCy models...')" >> test_models.py
for %%m in (%MODELS%) do (
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


:end_installation
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

exit /b 0
