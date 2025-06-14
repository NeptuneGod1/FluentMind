from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate
from functools import lru_cache
import spacy
import importlib

# Initialize SQLAlchemy and Migrate
db = SQLAlchemy()
migrate = Migrate()

# List of models to pre-download during setup
PRE_DOWNLOAD_MODELS = [
    # Most widely spoken languages
    "en_core_web_sm",      # English
    "zh_core_web_sm",      # Chinese
    "es_core_news_sm",     # Spanish
    "fr_core_news_sm",     # French
    "de_core_news_sm",     # German
    "ru_core_news_sm",     # Russian
    "ja_core_news_sm",     # Japanese
    "pt_core_news_sm",     # Portuguese
    "it_core_news_sm",     # Italian
    "nl_core_news_sm",     # Dutch
    
    # Additional European languages
    "uk_core_news_sm",     # Ukrainian
    "sv_core_news_sm",     # Swedish
    "sl_core_news_sm",     # Slovenian
    "ro_core_news_sm",     # Romanian
    "lt_core_news_sm",     # Lithuanian
    "el_core_news_sm",     # Greek
    "fi_core_news_sm",     # Finnish
    "da_core_news_sm",     # Danish
    "hr_core_news_sm",     # Croatian
    "ca_core_news_sm",     # Catalan
    
    # Fallback model
    "xx_ent_wiki_sm",      # Multilingual fallback
]

# Map of language names to SpaCy model names
SPACY_MODEL_MAP = {
    "English": "en_core_web_sm",
    "Chinese": "zh_core_web_sm",
    "Spanish": "es_core_news_sm",
    "French": "fr_core_news_sm",
    "German": "de_core_news_sm",
    "Russian": "ru_core_news_sm",
    "Japanese": "ja_core_news_sm",
    "Portuguese": "pt_core_news_sm",
    "Italian": "it_core_news_sm",
    "Dutch": "nl_core_news_sm",
    "Ukrainian": "uk_core_news_sm",
    "Swedish": "sv_core_news_sm",
    "Slovenian": "sl_core_news_sm",
    "Romanian": "ro_core_news_sm",
    "Lithuanian": "lt_core_news_sm",
    "Greek": "el_core_news_sm",
    "Finnish": "fi_core_news_sm",
    "Danish": "da_core_news_sm",
    "Croatian": "hr_core_news_sm",
    "Catalan": "ca_core_news_sm",
}

class Setting(db.Model):
    key = db.Column(db.String(50), primary_key=True)
    value = db.Column(db.String(200))

def pre_download_models(python_executable=None):
    """Pre-download common spaCy models during application startup.
    
    Args:
        python_executable (str, optional): Path to Python executable to use. 
            If None, tries to determine the correct Python executable.
    """
    import subprocess
    import sys
    import os
    import logging
    import sysconfig
    import shutil
    
    logger = logging.getLogger(__name__)
    
    def find_pip():
        """Find the best available pip executable."""
        # Try to find pip in the same directory as the Python executable
        python_dir = os.path.dirname(sys.executable)
        pip_path = os.path.join(python_dir, 'pip' + ('.exe' if os.name == 'nt' else ''))
        
        if os.path.exists(pip_path):
            return pip_path
            
        # Try python -m pip
        if shutil.which('python'):
            return 'python -m pip'
            
        # Try python3 -m pip
        if shutil.which('python3'):
            return 'python3 -m pip'
            
        # Last resort: just pip
        return 'pip'
    
    # Determine the Python executable to use
    if python_executable is None:
        python_executable = sys.executable
    
    # Get the pip command to use
    pip_command = find_pip()
    
    # Log the environment information for debugging
    logger.info(f"Python executable: {python_executable}")
    logger.info(f"Pip command: {pip_command}")
    logger.info(f"Python path: {sys.path}")
    
    def install_with_pip(pkg_name, pip_cmd=None):
        """Install a package using pip with the best available method."""
        if pip_cmd is None:
            pip_cmd = pip_command
            
        # Try different installation methods
        methods = []
        
        # Method 1: Use the pip command directly if it's a full path
        if os.path.isabs(pip_cmd.split()[0]) and os.path.exists(pip_cmd.split()[0]):
            methods.append(pip_cmd.split() + ["install", "--user", pkg_name])
        
        # Method 2: Try with python -m pip
        methods.append([python_executable, "-m", "pip", "install", "--user", pkg_name])
        
        # Method 3: Try with pip directly
        methods.append(["pip", "install", "--user", pkg_name])
        
        # Method 4: Try with python3 -m pip
        if sys.platform != 'win32':  # On Unix-like systems
            methods.append(["python3", "-m", "pip", "install", "--user", pkg_name])
        
        for cmd in methods:
            try:
                logger.info(f"Attempting to install {pkg_name} with: {' '.join(cmd)}")
                result = subprocess.run(
                    cmd,
                    capture_output=True,
                    text=True,
                    check=True
                )
                if result.returncode == 0:
                    logger.info(f"Successfully installed {pkg_name}")
                    return True, None
            except subprocess.CalledProcessError as e:
                logger.warning(f"Failed to install {pkg_name} with {' '.join(cmd)}: {e.stderr}")
            except Exception as e:
                logger.warning(f"Unexpected error installing {pkg_name}: {str(e)}")
        
        return False, f"All installation methods failed for {pkg_name}"
    
    # First, try to install the models using the best available method
    for model_name in PRE_DOWNLOAD_MODELS:
        try:
            # Check if model is already installed
            try:
                spacy.load(model_name)
                logger.info(f"SpaCy model '{model_name}' is already installed.")
                continue
            except (OSError, ImportError):
                logger.info(f"Model {model_name} not found, attempting to download...")
            
            # Try to install the model
            success, error = install_with_pip(model_name)
            
            if not success:
                # If direct installation failed, try with spacy download
                logger.info(f"Direct installation failed, trying spacy download for {model_name}")
                try:
                    result = subprocess.run(
                        [python_executable, "-m", "spacy", "download", "--user", model_name],
                        capture_output=True,
                        text=True
                    )
                    if result.returncode == 0:
                        logger.info(f"Successfully downloaded {model_name} via spacy download")
                        success = True
                    else:
                        logger.error(f"spacy download failed for {model_name}: {result.stderr}")
                except Exception as e:
                    logger.error(f"Exception during spacy download of {model_name}: {str(e)}")
            
            # Verify the model was installed
            if success:
                try:
                    spacy.load(model_name)
                    logger.info(f"Successfully verified model: {model_name}")
                except Exception as e:
                    logger.error(f"Failed to load model after installation: {model_name}, error: {str(e)}")
            else:
                logger.error(f"Failed to install model: {model_name}")
                
        except Exception as e:
            logger.error(f"Unexpected error processing {model_name}: {str(e)}")
            import traceback
            logger.error(traceback.format_exc())

@lru_cache(maxsize=32)  # Increased cache size to accommodate more languages
def get_spacy_model(language_name):
    """
    Get a spaCy language model for the specified language.
    
    Args:
        language_name (str): Name of the language (e.g., 'English', 'Spanish')
        
    Returns:
        spacy.language.Language: Loaded spaCy model. Falls back to multilingual model if specific model not found.
    """
    if not language_name:
        language_name = "English"  # Default to English if no language specified
    
    # Try to find the model in our mapping (case-insensitive)
    model_name = None
    
    # First try exact match
    if language_name in SPACY_MODEL_MAP:
        model_name = SPACY_MODEL_MAP[language_name]
    else:
        # Try case-insensitive match
        normalized_name = language_name.lower()
        for lang_name, model in SPACY_MODEL_MAP.items():
            if lang_name.lower() == normalized_name:
                model_name = model
                break
    
    # If no specific model found, use the multilingual model
    if not model_name:
        print(f"No specific model found for '{language_name}'. Falling back to multilingual model.")
        model_name = "xx_ent_wiki_sm"
    
    try:
        # Try to load the model
        nlp = spacy.load(model_name)
        print(f"Loaded spaCy model: {model_name}")
        return nlp
    except OSError:
        # If the specific model fails to load, try the multilingual model
        if model_name != "xx_ent_wiki_sm":
            print(f"Failed to load model '{model_name}'. Falling back to multilingual model.")
            try:
                return spacy.load("xx_ent_wiki_sm")
            except OSError as e:
                print(f"Failed to load multilingual model: {e}")
                return None
        print(f"Warning: spaCy model '{model_name}' not found. Please run: python -m spacy download {model_name}")
        return None
    except Exception as e:
        # Other loading errors
        print(f"Error loading spaCy model '{model_name}': {e}")
        return None
