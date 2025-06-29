# ModernLWT3: Language Learning App

## 🚀 Quick Start (No Coding Needed)

### 1. Download the App
- Go to the GitHub repository: https://github.com/NeptuneGod1/FluentMind
- Click the green `<> Code` button and select `Download ZIP`.
- Unzip the file to a folder on your computer (e.g., `C:\FluentMind`).

### 2. Install Everything (First Time Only)
- Double-click `install.bat` in the folder.
- This sets up everything you need (Python, modules, etc).
- Wait for "Installation complete!".

### 3. Run the App
- Double-click `run.bat` in the folder.
- A browser window will open automatically, but it may show an error at first—this is normal!
- Wait a few seconds until a new terminal window appears showing the app is running.
- Then refresh the browser, or copy and paste this address into your browser:
  - [http://127.0.0.1:5000/](http://127.0.0.1:5000/)
- The app will be ready to use when you see the homepage.

---

## ❓ Troubleshooting
- **Python Not Installed?**
  - If you see an error about Python, download and install [Python 3.9+](https://www.python.org/downloads/) and try again.
- **Security Prompt?**
  - Click "More info" > "Run anyway" (for your own scripts only).
- **Updating?**
  - If you get new files from GitHub, double-click `install.bat` again to update dependencies.

---

## 👩‍💻 For Advanced Users
- All dependencies are in `requirements.txt`.
- You can use your own Python/virtual environment if you prefer.

---

**Questions?**
- Contact the project maintainer or open an issue on GitHub.


## Quick Start for Beginners

**No coding required!**

### 1. Installation (First Time Only)
- Double-click `install.bat`.
- This will set up everything you need (Python, modules, etc).
- Wait until you see "Installation complete!".

### Prerequisites

You will need:
*   **Python 3.9 or higher**: If you don't have Python installed, you can download it from [python.org](https://www.python.org/downloads/). Make sure to check "Add Python to PATH" during installation.
*   **A web browser**: Like Chrome, Firefox, Edge, or Safari.

### Step 1: Download the Application

1.  **Go to the GitHub repository**: https://github.com/NeptuneGod1/FluentMind
2.  Click on the green `<> Code` button.
3.  Select `Download ZIP`.
4.  Once downloaded, unzip the file to a folder on your computer (e.g., `C:\FluentMind`).

### Step 2: Open a Terminal (Command Prompt/PowerShell for Windows, Terminal for macOS/Linux)

This is where you'll type commands to set up and run the application.

*   **Windows**: Search for "Command Prompt" or "PowerShell" in your Start menu and open it.
*   **macOS/Linux**: Open "Terminal" from your Applications folder.

### Step 3: Navigate to the Application Folder

In the terminal, type the following command and press Enter:

```bash
cd C:\FluentMind  (Replace C:\FluentMind with the actual path where you unzipped the folder)
```
*If you are on macOS/Linux, the path might look like `/Users/YourUsername/FluentMind` or similar.*

### Step 4: Create a Virtual Environment (Recommended)

A virtual environment keeps the application's dependencies separate from your main Python installation. This is good practice and helps avoid conflicts.

Type the following command and press Enter:

```bash
python -m venv venv
```

### Step 5: Activate the Virtual Environment

Before running the application, you need to activate the virtual environment.

*   **Windows (Command Prompt):**
    ```bash
    venv\Scripts\activate.bat
    ```
*   **Windows (PowerShell):**
    ```powershell
    .\venv\Scripts\Activate.ps1
    ```
*   **macOS/Linux:**
    ```bash
    source venv/bin/activate
    ```
You should see `(venv)` appear at the beginning of your terminal prompt, indicating the virtual environment is active.

### Step 6: Install Required Libraries

With your virtual environment active, install all the necessary Python libraries:

```bash
pip install -r requirements.txt
```
This might take a few moments.

### Step 7: Initialize and Upgrade the Database

The application uses a database to store your lessons and vocabulary. You need to set it up:

```bash
flask db init
flask db migrate -m "Initial migration"
flask db upgrade
```
*If you see warnings about "Directory /migrations already exists", that's okay. The important part is `flask db upgrade`.*

### Step 8: Run the Application

Now you can start the web application!

*   **Windows (Simple start):**
    ```bash
    start_app.bat
    ```
*   **All Operating Systems (More control):**
    ```bash
    flask run
    ```
You should see output indicating that the Flask development server is running, usually on `http://127.0.0.1:5000` or `http://localhost:5000`.

### Step 9: Access the Application in Your Browser

Open your web browser and go to:

[http://localhost:5000](http://localhost:5000)

That's it! The FluentMind application should now be running in your browser.

---

## Usage

*   **Import Lessons**: You can add new text lessons, including YouTube video URLs, to practice with.
*   **Interactive Reader**: Click on words to look them up, save translations, and track your learning progress.
*   **Video Sync**: If a YouTube URL is provided, the text will synchronize with the video playback.

## Advanced Usage

### Adding YouTube Lessons with Timestamps

When creating a new lesson, if you include a YouTube video URL, FluentMind will attempt to fetch and process its subtitles (captions). If subtitles with timestamps are available, they will be imported automatically, enabling precise video synchronization.

### Auto-Scrolling and Auto-Pagination

When a YouTube video is linked to a lesson and playing, the text in the reader will automatically scroll to the current sentence as the video progresses.

*   **Auto-Pagination**: If the video reaches the end of the current page of text, the system will automatically advance to the next page, ensuring a continuous reading experience.
*   **Repeat Features**:
    *   **Repeat Sentence (`&#x27F3;`)**: Click this button to loop the currently active sentence. The video will automatically seek back to the beginning of the sentence and repeat.
    *   **Repeat Page (`&#x21BB;`)**: Click this button to loop the entire current page of text. The video will automatically seek to the beginning of the page and repeat playback until the end of the page.

## Adding a New Language

To add support for a new language in FluentMind:

1. **Prepare Language Files**:
   - Create a new folder in the `languages` directory with the language code (e.g., `fr` for French).
   - Add these required files:
     - `config.json`: Contains language-specific settings
     - `dictionary.txt`: List of common words (one per line)
     - `stopwords.txt`: Common words to ignore (articles, prepositions, etc.)

2. **Update Configuration**:
   - Edit `config.json` to include language metadata:
     ```json
     {
       "name": "French",
       "code": "fr",
       "dictionary": "languages/fr/dictionary.txt",
       "stopwords": "languages/fr/stopwords.txt"
     }
     ```

3. **Restart the Application**:
   - The new language should now be available in the language selection dropdown.

## Adding Dictionaries

FluentMind supports custom dictionaries for better word recognition and translation. Here's how to add them:

1. **Formatting Rules**:
   - Each dictionary entry should be on a new line
   - Use `###` to separate words from their translations
   - Example:
     ```
     hello###hola
     goodbye###adiós
     ```

2. **Adding a Dictionary**:
   - Place your dictionary file in the `dictionaries` folder
   - The filename should follow the pattern: `[source_lang]-[target_lang].txt` (e.g., `en-es.txt`)
   - Each line should contain a word/phrase pair separated by `###`

3. **Using Your Dictionary**:
   - The application will automatically detect and use the appropriate dictionary based on the selected languages
   - Dictionaries are loaded when the application starts

## Troubleshooting

*   **`ModuleNotFoundError: No module named 'flask'` (or similar)**:
    *   Make sure your virtual environment is activated (Step 5).
    *   Ensure you ran `pip install -r requirements.txt` successfully (Step 6).
*   **"Port already in use"**:
    *   Another program might be using port 5000. You can usually ignore this for development or try restarting your computer.
*   **`flask db upgrade` error**:
    *   If you encounter issues, ensure you are in the correct directory and your virtual environment is active. You might need to delete `app.db` and the `migrations` folder (if they exist) and retry Step 7, but **be aware this will delete any existing data.**
*   **Something else is wrong**:
    *   Take a screenshot of your terminal and the error message.
    *   If you're using this from a GitHub fork, you can open an "Issue" on GitHub and paste the error there for help.

--- 