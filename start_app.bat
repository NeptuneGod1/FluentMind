REM 
echo Starting App Launcher...
pause

set VENV_PYTHON=.\venv\Scripts\python.exe
set PYTHON_CMD=py

echo Checking for virtual environment Python: %VENV_PYTHON%
pause

IF EXIST %VENV_PYTHON% (
    echo Found venv Python. Setting Python command.
    set PYTHON_CMD=%VENV_PYTHON%
) ELSE (
    echo Did not find venv Python. Using system 'py'.
    echo Make sure dependencies are installed globally if not using venv.
)
pause

echo Using Python command: %PYTHON_CMD%
pause

echo Setting FLASK_APP=app.py
set FLASK_APP=app.py
pause

echo Attempting to run: %PYTHON_CMD% app.py
pause

%PYTHON_CMD% app.py

echo Script finished or app terminated.
pause 