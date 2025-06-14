# Windows Installation Troubleshooting (for Non-Coders)

If you run into errors about numpy, pandas, or Visual Studio Build Tools (vswhere.exe) during install, follow these steps:

## 1. Make Sure You Have the Right Python
- Download Python 3.10, 3.11, or 3.12 (64-bit) from https://www.python.org/downloads/
- **Do NOT use the Microsoft Store version.**
- During install, check "Add Python to PATH".

## 2. Remove Old Python/venv
- Uninstall any old Python versions.
- Delete the `venv` folder in your project if it exists.

## 3. Try Again
- Double-click `install.bat`.

## 4. If You Still Get Errors (Advanced)
- Download pre-built wheels for numpy and pandas from these links:
    - [numpy wheels](https://pypi.org/project/numpy/#files)
    - [pandas wheels](https://pypi.org/project/pandas/#files)
- Download the files that match your Python version (e.g., cp311 for Python 3.11, win_amd64 for 64-bit Windows).
- Open a command prompt in your project folder and run:
    ```
    pip install path\to\numpy.whl
    pip install path\to\pandas.whl
    ```
- Then run `install.bat` again.

## 5. Still Stuck?
- Contact the project maintainer or open an issue on GitHub for help.

---

**Tip:** Most errors are fixed by using the official Python installer and making sure pip is up to date!
