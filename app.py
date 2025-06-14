import os
import tempfile
import pandas as pd
from flask import (
    Flask,
    render_template,
    request,
    redirect,
    url_for,
    flash,
    session,
    jsonify,
    Response,
    send_file,
    send_from_directory,
    current_app,
)  # Added jsonify, Response, and send_file
from werkzeug.utils import secure_filename
from extensions import db, migrate, Setting, get_spacy_model, SPACY_MODEL_MAP  # Import shared models and utilities from extensions
from sqlalchemy.exc import IntegrityError  # Import IntegrityError
from sqlalchemy import func
from datetime import (
    datetime,
    timedelta,
    date,
    timezone,
)  # Import datetime, timedelta, and date
import csv  # For CSV export/import
import io  # For CSV export/import
import openai  # Import OpenAI library

# --- Add ElevenLabs Imports ---
from elevenlabs.client import ElevenLabs
from elevenlabs import save

# --- End ElevenLabs Imports ---
import requests  # To download images
import shutil  # To save downloaded images
from bs4 import BeautifulSoup  # Import BeautifulSoup
import spacy  # Import spaCy
import json  # Added import for json
import re  # Added import for re
import random  # Added import for random
import logging
from threading import Thread
import subprocess
import sys
from fsrs import (
    Scheduler,
    Card,
    State,
    Rating,
    ReviewLog,
)  # Import FSRS components (renamed FSRS to Scheduler)
from dotenv import load_dotenv
from vocab_utils import get_cefr_progress, process_text_for_vocab, process_text, compute_readability, get_words_for_readability
from functools import lru_cache # Add this import

# Load environment variables
load_dotenv()

# Initialize the Flask application
app = Flask(__name__)

# Initialize FSRS scheduler with proper parameters
scheduler = Scheduler(
    desired_retention=0.9,  # 90% retention target
    learning_steps=(timedelta(minutes=1), timedelta(minutes=10)),
    relearning_steps=(timedelta(minutes=10),),
    maximum_interval=36500,  # ~100 years
    enable_fuzzing=True,
)

# Constants for custom status levels (Visible Levels for the User)
STATUS_UNKNOWN = 0
STATUS_LEVEL_1 = 1 # 'New' or just starting learning
STATUS_LEVEL_2 = 2
STATUS_LEVEL_3 = 3
STATUS_LEVEL_4 = 4
STATUS_LEVEL_5 = 5 # Mastered Learning, ready for 'Known'
STATUS_KNOWN = 6   # Known and in long-term review
STATUS_IGNORED = 7 # Ignored, won't appear in review

# Map FSRS states to legacy status for initial display/categorization
FSRS_STATE_TO_STATUS = {
    "learning": STATUS_LEVEL_1,  # FSRS 'Learning' maps to custom Level 1
    "review": STATUS_KNOWN,      # FSRS 'Review' maps to custom 'Known'
    "relearning": STATUS_LEVEL_1, # FSRS 'Relearning' maps to custom Level 1
}

# Map string states to FSRS State enum
STATE_MAP = {
    "new": State.Learning,      # DB 'new' maps to FSRS Learning state
    "learning": State.Learning,
    "review": State.Review,
    "relearning": State.Relearning,
}

# Constants for review ratings
RATING_AGAIN = "again"
RATING_HARD = "hard"
RATING_GOOD = "good"
RATING_EASY = "easy"

# Map string ratings to FSRS Rating enum
RATING_MAP = {
    RATING_AGAIN: Rating.Again,
    RATING_HARD: Rating.Hard,
    RATING_GOOD: Rating.Good,
    RATING_EASY: Rating.Easy,
}

# Configuration
BASE_DIR = os.path.abspath(os.path.dirname(__file__))
app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///" + os.path.join(
    BASE_DIR, "app.db"
)  # Path to database file
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False  # Disable modification tracking
UPLOAD_FOLDER = os.path.join("static", "uploads")
ALLOWED_EXTENSIONS = {
    "png",
    "jpg",
    "jpeg",
    "gif",
    "mp4",
    "avi",
    "mov",
    "mkv",
    "webm",
    "mp3",
    "wav",
    "ogg",
}
app.config["UPLOAD_FOLDER"] = UPLOAD_FOLDER
app.config["MAX_CONTENT_LENGTH"] = 1 * 1024 * 1024 * 1024  # 1 GB limit for uploads
app.config["SECRET_KEY"] = os.getenv("SECRET_KEY", "dev")  # CHANGE THIS

# Import extensions
from extensions import db, migrate, Setting  # Import Setting from extensions

# Initialize extensions
db.init_app(app)
migrate.init_app(app, db)


# --- Database Models (Define structure) ---
class Language(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(50), unique=True, nullable=False, index=True)  # Added index for faster lookups
    level = db.Column(db.String(10), index=True)  # e.g., A1, B2 - added index for filtering
    days_learning = db.Column(db.Integer, default=0, index=True)  # Added index for sorting
    card_background_image = db.Column(db.String(200))  # Filename for card bg
    # Store comma-separated IDs of active dictionaries for this language
    active_dictionary_ids = db.Column(db.String(500), default="")
    # Relationship to lessons (one language has many lessons)
    lessons = db.relationship(
        "Lesson", backref="language", lazy=True, cascade="all, delete-orphan"
    )
    # Relationship to SRS Settings (one-to-one)
    # srs_settings defined via backref in SRSSettings model
    # Add a column for SpaCy model status
    spacy_model_status = db.Column(
        db.String(50), default="not_available"
    )  # e.g., 'not_available', 'downloading', 'available', 'failed'
    # Add more fields later: default_dict_urls, etc.

    def __repr__(self):
        return f"<Language {self.name}>"


# SPACY_MODEL_MAP and get_spacy_model have been moved to extensions.py


# --- SRS Settings Model ---
class SRSSettings(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    language_id = db.Column(
        db.Integer, db.ForeignKey("language.id"), unique=True, nullable=False
    )

    # Anki-like settings with defaults
    new_cards_per_day = db.Column(db.Integer, default=20, nullable=False)
    max_reviews_per_day = db.Column(db.Integer, default=200, nullable=False)

    # Learning steps (space separated minutes)
    learning_steps = db.Column(db.String(100), default="1 10", nullable=False)
    # Interval after graduating learning steps (days)
    graduating_interval = db.Column(db.Integer, default=1, nullable=False)
    # Interval for "Easy" button in learning steps (days)
    easy_interval = db.Column(db.Integer, default=4, nullable=False)

    # Starting ease factor (percentage, stored as float e.g., 2.5 for 250%)
    starting_ease = db.Column(db.Float, default=2.5, nullable=False)

    # Multipliers for review answers
    easy_bonus = db.Column(
        db.Float, default=1.3, nullable=False
    )  # Applied to current interval * ease
    interval_modifier = db.Column(
        db.Float, default=1.0, nullable=False
    )  # Global interval multiplier
    hard_interval_multiplier = db.Column(
        db.Float, default=1.2, nullable=False
    )  # Multiplier for "Hard" rating

    # Relationship back to language (for easy access settings.language)
    language = db.relationship(
        "Language",
        backref=db.backref("srs_settings", uselist=False, cascade="all, delete-orphan"),
        lazy=True,
    )

    def __repr__(self):
        return f"<SRSSettings for Lang ID {self.language_id}>"


# --- End SRS Settings Model ---


class Dictionary(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    url_pattern = db.Column(
        db.String(500), nullable=False
    )  # e.g., https://example.com/search?q=###
    # Future: Add language association? Or keep global?

    def __repr__(self):
        return f"<Dictionary {self.name}>"


class Lesson(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    language_id = db.Column(db.Integer, db.ForeignKey("language.id"), nullable=False, index=True)  # Added index for faster lookups
    title = db.Column(db.String(200), nullable=False, index=True)  # Added index for searching
    text_content = db.Column(db.Text, nullable=False)
    source_url = db.Column(db.String(500))  # Optional URL where text came from
    word_count = db.Column(db.Integer, default=0, index=True)  # Added index for sorting
    image_filename = db.Column(db.String(200))  # Optional image for card bg
    media_url = db.Column(db.String(500))  # Optional YouTube/Audio URL
    youtube_url = db.Column(db.String(500), nullable=True, index=True)  # Added index for filtering
    audio_filename = db.Column(db.String(300), nullable=True, index=True)  # Added index for filtering
    grammar_summary = db.Column(db.Text, nullable=True)
    timestamps = db.Column(db.Text, nullable=True)  # Store timestamps as JSON string
    timestamp_offset = db.Column(
        db.Float, default=0.0, index=True  # Added index for sorting
    )  # Store timestamp offset in seconds
    readability_score = db.Column(db.Float, default=0.0, index=True)  # Added index for sorting
    
    # Add composite index for common query patterns
    __table_args__ = (
        db.Index('idx_lesson_language_readability', 'language_id', 'readability_score'),
        db.Index('idx_lesson_language_wordcount', 'language_id', 'word_count'),
    )

    def __repr__(self):
        return f"<Lesson {self.title} (Lang ID: {self.language_id})>"


# --- Add VocabTerm Model Back ---
class VocabTerm(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    language_id = db.Column(db.Integer, db.ForeignKey("language.id"), nullable=False)
    term = db.Column(
        db.String(200), nullable=False, index=True
    )  # Index for faster lookup
    lemma = db.Column(
        db.String(200), nullable=True, index=True
    )  # Base form, also indexed
    status = db.Column(
        db.Integer, default=0, nullable=False
    )  # 0:Unknown, 1-5:Learning, 6:Known, 7:Ignored
    translation = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow) # New field to track creation time

    # --- SRS Fields ---
    # When the term should be reviewed next (UTC timestamp)
    next_review_date = db.Column(db.DateTime, default=datetime.utcnow, index=True)
    # Current interval in days between reviews
    interval = db.Column(db.Integer, default=0)
    # Factor influencing interval increase (e.g., 2.5 for standard ease)
    ease_factor = db.Column(db.Float, default=2.5)
    # NEW FSRS Fields
    difficulty = db.Column(
        db.Float, default=0.0
    )  # Represents the inherent difficulty of the card
    stability = db.Column(db.Float, default=0.0)  # Represents how stable the memory is
    reviews = db.Column(
        db.Integer, default=0
    )  # Number of times the card has been reviewed
    lapses = db.Column(
        db.Integer, default=0
    )  # Number of times the card has been forgotten (rated 'again')
    state = db.Column(
        db.String(20), default="new"
    )  # e.g., 'new', 'learning', 'relearning', 'review'
    # Optional: Store the sentence where the term was first encountered
    context_sentence = db.Column(db.Text, nullable=True)
    # Direction of last review (R2E = Russian to English, E2R = English to Russian)
    last_reviewed_direction = db.Column(db.String(3), nullable=True)
    # Date of last review
    last_review_date = db.Column(db.DateTime, nullable=True)
    # New: Store the type of the last rating given to the card
    last_rating_type = db.Column(db.String(10), nullable=True) # 'again', 'hard', 'good', 'easy'
    # --- End SRS Fields ---

    # Ensure term/lemma is unique per language
    __table_args__ = (
        db.UniqueConstraint("language_id", "term", name="uq_language_term"),
        # Removed to allow tracking knowledge per individual term, even if lemmas are the same:
        # db.UniqueConstraint("language_id", "lemma", name="uq_language_lemma"),
        db.Index('ix_vocab_term_language_status', 'language_id', 'status'),
        db.Index('ix_vocab_term_next_review', 'next_review_date'),
    )

    language = db.relationship(
        "Language", backref=db.backref("vocab_terms", lazy="dynamic")
    )  # Use dynamic loading

    def __repr__(self):
        return f"<VocabTerm {self.term} (Lang ID: {self.language_id}, Status: {self.status})>"


# --- End VocabTerm Model ---


# --- Story Model ---
class Story(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    language_id = db.Column(db.Integer, db.ForeignKey("language.id"), nullable=False, index=True)  # Added index for faster lookups
    title = db.Column(
        db.String(200), nullable=True, index=True  # Added index for searching
    )  # Title might be AI generated or added later
    theme = db.Column(db.String(100), nullable=False, index=True)  # Added index for filtering
    content = db.Column(db.Text, nullable=False)
    cover_image_filename = db.Column(
        db.String(300), nullable=True
    )  # Store filename of locally saved cover
    audio_filename = db.Column(db.String(300), nullable=True, index=True)  # Added index for filtering
    grammar_summary = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, index=True)  # Added index for sorting
    readability_score = db.Column(db.Float, default=0.0, index=True)  # Added index for sorting
    
    # Add composite index for common query patterns
    __table_args__ = (
        db.Index('idx_story_language_theme', 'language_id', 'theme'),
        db.Index('idx_story_language_readability', 'language_id', 'readability_score'),
        db.Index('idx_story_created', 'created_at'),
    )

    language = db.relationship("Language", backref=db.backref("stories", lazy=True))

    def __repr__(self):
        return f"<Story {self.id} (Lang ID: {self.language_id}, Theme: {self.theme})>"


# --- End Story Model ---


# --- Helper function to get/set settings ---
def get_setting(key, default=None):
    setting = db.session.get(Setting, key)
    return setting.value if setting else default


def set_setting(key, value):
    setting = db.session.get(Setting, key)
    if setting:
        setting.value = value
    else:
        setting = Setting(key=key, value=value)
        db.session.add(setting)
    db.session.commit()


# -----------------------------------------


# --- Database Initialization Helper ---
# (This is useful if you clear the DB and want to re-run create_all)
@app.cli.command("init-db")
def init_db_command():
    """Clear existing data and create new tables."""
    db.create_all()
    print("Initialized the database.")


# -----------------------------------


def allowed_file(filename):
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


@app.route("/")
def dashboard():
    banner_filename = get_setting("dashboard_banner")
    languages = Language.query.order_by(Language.name).all()

    # --- Calculate Progress for each language ---
    target_known_words = 20000  # Define the goal
    for lang in languages:
        known_count = (
            db.session.query(func.count(func.distinct(VocabTerm.lemma)))
            .filter(VocabTerm.language_id == lang.id, VocabTerm.status == 6, VocabTerm.lemma.isnot(None))
            .scalar()
            or 0
        )  # Get count, default to 0 if query returns None

        # Calculate percentage, ensuring it doesn't exceed 100
        if target_known_words > 0:
            percentage = min(100, (known_count / target_known_words) * 100)
        else:
            percentage = 0  # Avoid division by zero if target is 0

        # Add calculated values as temporary attributes to the language object
        lang.known_count = known_count
        lang.progress_percent = percentage

        # Fetch CEFR progress and assign current_level to lang.level
        cefr_data = get_cefr_progress(lang.id)
        lang.level = cefr_data.get('current_level', 'N/A')

    # --- End Calculation ---

    return render_template(
        "dashboard.html",
        languages=languages,
        banner_image=banner_filename,
        target_known_words=target_known_words,
    )


@app.route("/upload_banner", methods=["POST"])
def upload_banner():
    # Removed: global current_banner_filename
    if "banner_image" not in request.files:
        flash("No file part")
        return redirect(url_for("settings"))
    file = request.files["banner_image"]
    if file.filename == "":
        flash("No selected file")
        return redirect(url_for("settings"))
    if file and allowed_file(file.filename):
        filename = secure_filename(file.filename)
        # Optional: Delete old banner file (logic needs update to use DB value)
        # old_banner = get_setting('dashboard_banner')
        # if old_banner:
        #    try: os.remove(...) etc.

        save_path = os.path.join(app.config["UPLOAD_FOLDER"], filename)
        file.save(save_path)

        # Save filename to database
        set_setting("dashboard_banner", filename)

        flash("Banner uploaded successfully!")
        return redirect(url_for("settings"))
    else:
        flash("Invalid file type")
        return redirect(url_for("settings"))


# Define a route for showing lessons within a language
@app.route("/language/<string:lang_name>")
def language_lessons(lang_name):
    language = Language.query.filter(Language.name.ilike(lang_name)).first()
    if not language:
        flash(f'Language "{lang_name}" not found.', "error")
        return redirect(url_for("dashboard"))

    # Query actual lessons associated with this language
    lessons = (
        Lesson.query.filter_by(language_id=language.id).order_by(Lesson.title).all()
    )

    return render_template(
        "language_lessons.html",
        language_name=language.name,
        language_id=language.id,  # Pass language ID for adding lessons
        lessons=lessons,
    )


# Define a route for the settings page
@app.route("/settings")
def settings():
    add_lang_msg = session.pop("add_language_msg", None)
    languages = Language.query.order_by(Language.name).all()
    # Query existing dictionaries
    dictionaries = Dictionary.query.order_by(Dictionary.name).all()

    return render_template(
        "settings.html",
        add_lang_msg=add_lang_msg,
        languages=languages,
        dictionaries=dictionaries,
    )


# --- Statistics Page ---
# Helper function to calculate stats for a given language ID
def get_language_stats(lang_id):
    # Ensure necessary imports are present at the top of the file:
    # from sqlalchemy import func

    # Query to count unique terms grouped by status for the specific language
    # Assuming VocabTerm model exists and has 'status' and 'language_id' columns
    stats_data = (
        db.session.query(
            VocabTerm.status,
            func.count(VocabTerm.term.distinct()),  # Count distinct terms
        )
        .filter(VocabTerm.language_id == lang_id)
        .group_by(VocabTerm.status)
        .all()
    )

    # Convert to a dictionary format suitable for charting
    # {0: count, 1: count, ..., 7: count}
    stats_dict = {status: count for status, count in stats_data}

    # Ensure all statuses from 0 to 7 are present, even if count is 0
    full_stats = {i: stats_dict.get(i, 0) for i in range(8)}
    return full_stats


@app.route("/stats")
# @login_required # Uncomment if login is required
def stats():
    # Ensure necessary imports are present at the top of the file:
    # from flask import request, jsonify
    # Assuming Language model exists and has 'user_id' relationship or similar filter logic

    # Get all languages for the current user for the dropdown
    # Adjust filter as per your user model/relationship (using a placeholder user_id=1 for now)
    # languages = Language.query.filter_by(user_id=current_user.id).order_by(Language.name).all()
    languages = Language.query.order_by(Language.name).all()  # TEMP: No user filter

    # Get selected language ID from query parameter or default to the first language
    selected_lang_id = request.args.get('lang_id', type=int)
    if not selected_lang_id and languages:
        selected_lang_id = languages[0].id

    # Get timespan from query parameter or default
    selected_timespan = request.args.get('timespan', '30d')

    return render_template("stats.html", languages=languages, selected_lang_id=selected_lang_id, selected_timespan=selected_timespan)


# Helper function to get date range based on timespan
def get_date_range(timespan):
    end_date = datetime.utcnow().replace(tzinfo=timezone.utc)
    if timespan == '7d':
        start_date = end_date - timedelta(days=7)
    elif timespan == '30d':
        start_date = end_date - timedelta(days=30)
    elif timespan == '90d':
        start_date = end_date - timedelta(days=90)
    elif timespan == '365d':
        start_date = end_date - timedelta(days=365)
    elif timespan == 'all':
        start_date = datetime.min.replace(tzinfo=timezone.utc) # Start from beginning of time
    else:
        start_date = end_date - timedelta(days=30) # Default to 30 days
    return start_date, end_date


@app.route("/api/stats/summary/<int:language_id>")
def get_stats_summary_api(language_id):
    try:
        # Ensure language exists (add user check if applicable)
        language = Language.query.get_or_404(language_id)

        timespan = request.args.get('timespan', '30d')
        start_date, end_date = get_date_range(timespan)

        # --- 1. Total Vocabulary & Words Known ---
        total_vocab = VocabTerm.query.filter_by(language_id=language_id).count()
        words_known = VocabTerm.query.filter_by(language_id=language_id, status=STATUS_KNOWN).count()

        # Calculate new words learned within the timespan
        # Let's use words that were created within the timespan as a proxy for new words added.
        new_words_this_period = VocabTerm.query.filter(
            VocabTerm.language_id == language_id,
            VocabTerm.created_at >= start_date 
        ).count()

        # Percentage of known words
        words_known_percent = (words_known / total_vocab * 100) if total_vocab > 0 else 0

        # --- 2. Current CEFR ---
        cefr_data = get_cefr_progress(language_id)
        current_cefr = cefr_data.get('current_level', 'N/A')
        cefr_percentage = cefr_data.get('current_level_percentage', 0) # Need to return this from get_cefr_progress

        # --- 3. Study Streak ---
        # This requires tracking daily study activity. For now, a placeholder.
        study_streak = 5 # Dummy data
        study_streak_unit = "days"

        return jsonify({
            'total_vocab': total_vocab,
            'total_vocab_change': new_words_this_period, # Proxy for change
            'words_known': words_known,
            'words_known_percent': round(words_known_percent, 1),
            'current_cefr': current_cefr,
            'cefr_percentage': round(cefr_percentage, 1),
            'study_streak': study_streak,
            'study_streak_unit': study_streak_unit
        })
    except Exception as e:
        current_app.logger.error(f"Error fetching stats summary: {e}")
        return jsonify({'error': 'Internal Server Error'}), 500


@app.route("/api/stats/vocabulary/<int:language_id>")
def get_stats_vocabulary_api(language_id):
    try:
        language = Language.query.get_or_404(language_id)
        timespan = request.args.get('timespan', 'all') # Vocabulary distribution usually for all time

        # Query to count vocabulary terms by status for the specific language
        query = db.session.query(VocabTerm.status, func.count(VocabTerm.id)).filter(VocabTerm.language_id == language_id)
        # Removed timespan filter for vocabulary distribution, as it should show all terms.
        # if timespan != 'all':
        #     query = query.filter(VocabTerm.created_at >= start_date)

        status_counts = query.group_by(VocabTerm.status).all()

        # --- ADD THIS LINE ---
        print(f"DEBUG: Vocab status counts from DB for lang {language_id}: {status_counts}")
        # ---------------------

        # Initialize counts for all possible statuses
        vocab_distribution = {i: 0 for i in range(8)} # 0-7 for our defined statuses

        for status, count in status_counts:
            vocab_distribution[status] = count
        
        # Convert to list ordered by status number for Chart.js
        ordered_counts = [vocab_distribution[i] for i in range(8)]

        return jsonify(ordered_counts)
    except Exception as e:
        current_app.logger.error(f"Error fetching vocabulary stats: {e}")
        return jsonify({'error': 'Internal Server Error'}), 500


@app.route("/api/stats/learning-curve/<int:language_id>")
def get_stats_learning_curve_api(language_id):
    try:
        language = Language.query.get_or_404(language_id) # Consistent language fetching
        timespan = request.args.get('timespan', '30d')
        start_date, end_date = get_date_range(timespan)

        # Query to count new words created per day within the timespan, considering only learned words
        daily_new_words = db.session.query(
            db.func.strftime('%Y-%m-%d', VocabTerm.created_at),
            db.func.count(VocabTerm.id)
        ).filter(
            VocabTerm.language_id == language_id,
            db.func.date(VocabTerm.created_at) >= start_date.strftime('%Y-%m-%d'),
            db.func.date(VocabTerm.created_at) <= end_date.strftime('%Y-%m-%d'),
            VocabTerm.status >= 1,  # STATUS_LEVEL_1
            VocabTerm.status <= 6   # STATUS_KNOWN
        ).group_by(db.func.strftime('%Y-%m-%d', VocabTerm.created_at)).order_by(db.func.strftime('%Y-%m-%d', VocabTerm.created_at)).all()

        # Create a dictionary to hold counts for all days in the range
        date_counts = {date.strftime('%Y-%m-%d'): 0 for date in
                       (start_date + timedelta(days=n) for n in range((end_date - start_date).days + 1))}

        for date_str, count in daily_new_words:
            date_counts[date_str] = count

        # Extract labels and new words in order
        labels = sorted(date_counts.keys())
        new_words = [date_counts[date] for date in labels]

        return jsonify({'labels': labels, 'newWords': new_words})
    except Exception as e:
        current_app.logger.error(f"Error fetching learning curve data: {e}")
        return jsonify({'error': 'Internal Server Error'}), 500

@app.route("/api/stats/reviews/<int:language_id>")
def get_stats_reviews_api(language_id):
    try:
        language = Language.query.get_or_404(language_id)
        timespan = request.args.get('timespan', '30d')
        start_date, end_date = get_date_range(timespan)

        daily_ratings = db.session.query(
            db.func.strftime('%Y-%m-%d', VocabTerm.last_review_date).label('review_date'),
            VocabTerm.last_rating_type,
            db.func.count(VocabTerm.id).label('count')
        ).filter(
            VocabTerm.language_id == language_id,
            VocabTerm.last_review_date.isnot(None),
            VocabTerm.last_review_date >= start_date,
            VocabTerm.last_review_date <= end_date
        ).group_by(
            'review_date',
            VocabTerm.last_rating_type
        ).order_by('review_date').all()

        daily_data = {date.strftime('%Y-%m-%d'): {'total': 0, 'successful': 0, 'failed': 0}
                      for date in (start_date + timedelta(days=n) for n in range((end_date - start_date).days + 1))}

        for review_date, rating_type, count in daily_ratings:
            if review_date in daily_data:
                daily_data[review_date]['total'] += count
                if rating_type in ['good', 'easy']:
                    daily_data[review_date]['successful'] += count
                elif rating_type in ['again', 'hard']:
                    daily_data[review_date]['failed'] += count

        labels = sorted(daily_data.keys())
        accuracy_data = []
        retention_data = []

        for date_str in labels:
            data = daily_data[date_str]
            total = data['total']
            successful = data['successful']
            failed = data['failed']

            if total > 0:
                acc = (successful / total) * 100
                # Retention: proportion of reviews that were not 'again' (i.e., good, easy, or hard)
                ret = ((total - failed) / total) * 100
            else:
                acc = 0
                ret = 0
            accuracy_data.append(round(acc, 1))
            retention_data.append(round(ret, 1))

        return jsonify({'labels': labels, 'accuracy': accuracy_data, 'retention': retention_data})
    except Exception as e:
        current_app.logger.error(f"Error fetching review stats: {e}")
        return jsonify({'error': 'Internal Server Error'}), 500

@app.route("/api/stats/lessons/<int:language_id>")
def get_stats_lessons_api(language_id):
    try:
        language = Language.query.get_or_404(language_id)
        timespan = request.args.get('timespan', '30d')
        start_date, end_date = get_date_range(timespan)

        # Query lessons created per day within the timespan
        daily_lessons_created = db.session.query(
            db.func.strftime('%Y-%m-%d', Lesson.created_at),
            db.func.count(Lesson.id)
        ).filter(
            Lesson.language_id == language_id,
            db.func.date(Lesson.created_at) >= start_date.strftime('%Y-%m-%d'),
            db.func.date(Lesson.created_at) <= end_date.strftime('%Y-%m-%d')
        ).group_by(db.func.strftime('%Y-%m-%d', Lesson.created_at)).order_by(db.func.strftime('%Y-%m-%d', Lesson.created_at)).all()

        # Query stories created per day within the timespan
        daily_stories_created = db.session.query(
            db.func.strftime('%Y-%m-%d', Story.created_at),
            db.func.count(Story.id)
        ).filter(
            Story.language_id == language_id,
            db.func.date(Story.created_at) >= start_date.strftime('%Y-%m-%d'),
            db.func.date(Story.created_at) <= end_date.strftime('%Y-%m-%d')
        ).group_by(db.func.strftime('%Y-%m-%d', Story.created_at)).order_by(db.func.strftime('%Y-%m-%d', Story.created_at)).all()

        # Create dictionaries to hold counts for all days in the range
        date_range = [start_date + timedelta(days=n) for n in range((end_date - start_date).days + 1)]
        lesson_counts = {d.strftime('%Y-%m-%d'): 0 for d in date_range}
        story_counts = {d.strftime('%Y-%m-%d'): 0 for d in date_range}

        for date_str, count in daily_lessons_created:
            lesson_counts[date_str] = count

        for date_str, count in daily_stories_created:
            story_counts[date_str] = count

        labels = sorted(lesson_counts.keys())
        lessons_data = [lesson_counts[date] for date in labels]
        stories_data = [story_counts[date] for date in labels]

        return jsonify({'labels': labels, 'lessons': lessons_data, 'stories': stories_data})
    except Exception as e:
        current_app.logger.error(f"Error fetching lessons data: {e}")
        return jsonify({'error': 'Internal Server Error'}), 500


# --- Updated Reader Route ---
@app.route("/read/<string:lang_name>/<int:lesson_id>")
def reader(lang_name, lesson_id):
    # Fetch the specific lesson
    lesson = Lesson.query.get_or_404(lesson_id)
    # Make sure the lesson belongs to the language specified in the URL
    if lesson.language.name.lower() != lang_name.lower():
        flash(
            f"Lesson ID {lesson_id} does not belong to language {lang_name}.", "error"
        )
        # Redirect to the language page or show an error template
        return redirect(url_for("language_lessons", lang_name=lang_name))

    # Fetch the language details
    language = lesson.language

    # --- DEBUG: Print timestamps value before rendering ---
    print(
        f"DEBUG: Lesson {lesson.id} timestamps value: {lesson.timestamps}"
    )  # Print full string
    print(
        f"DEBUG: Lesson {lesson.id} timestamps length: {len(lesson.timestamps) if lesson.timestamps else 0}"
    )
    # ----------------------------------------------------

    return render_template("index.html", language=language, lesson=lesson)


# --- New Grammar View Route ---
@app.route("/lesson/<int:lesson_id>/grammar")
def view_grammar_notes(lesson_id):
    lesson = Lesson.query.get_or_404(lesson_id)
    language = lesson.language

    # For now, just pass the lesson data. We might need to fetch/pass grammar data later.
    # If the grammar_summary is stored directly on the lesson:
    grammar_summary = lesson.grammar_summary

    # If grammar needs generating or fetching via API logic:
    # You might need to call a helper function or adapt the logic from `get_grammar_summary` here
    # Example: grammar_summary_data = _fetch_or_generate_grammar(lesson)

    return render_template(
        "grammar_view.html",
        lesson=lesson,
        language=language,
        grammar_summary=grammar_summary,
    )


# --- End New Grammar View Route ---


# --- Route to Add Language ---
@app.route("/add_language", methods=["POST"])
def add_language():
    name = request.form.get("language_name")
    level = request.form.get("language_level")
    message = None
    msg_category = "error"  # Default to error

    if not name:
        session['add_language_msg'] = {"text": "Language name is required.", "category": "error"}
    else:
        existing_lang = Language.query.filter(Language.name.ilike(name)).first()
        if existing_lang:
            session['add_language_msg'] = {"text": f"{name} already exists.", "category": "error"}
        else:
            # Determine SpaCy model status based on availability
            model_name = SPACY_MODEL_MAP.get(name.strip().capitalize())
            initial_spacy_status = "not_available"
            if model_name:
                initial_spacy_status = "downloading"

            # Create Language
            new_lang = Language(
                name=name.strip().capitalize(),
                level=level.strip() if level else None,
                spacy_model_status=initial_spacy_status,
            )
            db.session.add(new_lang)
            # Important: Flush to get the new_lang.id before creating settings or starting download
            db.session.flush()

            # Create default SRS settings for the new language
            default_srs = SRSSettings(language_id=new_lang.id)
            db.session.add(default_srs)

            # Commit both Language and SRSSettings
            db.session.commit()

            if model_name:
                # Start the download in a background thread
                thread = Thread(
                    target=download_and_update_status, args=(new_lang.id, model_name)
                )
                thread.daemon = (
                    True  # Allow the main program to exit even if thread is running
                )
                thread.start()
                session['add_language_msg'] = {
                    "text": "Language added. SpaCy model is downloading in the background.",
                    "category": "info"
                }
            else:
                session['add_language_msg'] = {
                    "text": "Language added, but no SpaCy model found for it. Text processing may not work.",
                    "category": "warning"
                }

    return redirect(url_for("settings"))


# ---------------------------


@app.route("/delete_language/<int:lang_id>", methods=["POST"])
def delete_language(lang_id):
    """
    Delete a language and all its associated data.
    
    This endpoint handles the deletion of a language and all its related data including:
    - SRS review logs
    - Vocabulary terms
    - Lessons
    - SRS settings
    
    Args:
        lang_id (int): The ID of the language to delete
        
    Returns:
        JSON: A JSON response indicating success or failure
        
    HTTP Methods:
        POST
        
    Example Response (Success):
        {
            "success": True,
            "message": "Language 'Spanish' and all associated data have been deleted."
        }
        
    Example Response (Error):
        {
            "success": False,
            "message": "Language not found."
        }
    """
    try:
        # Get the language by ID
        language = db.session.get(Language, lang_id)
        if not language:
            return jsonify({"success": False, "message": "Language not found."}), 404
            
        # Delete related records in the correct order to avoid foreign key constraint violations
        # 1. Delete any SRS reviews for terms in this language (if ReviewLog model exists)
        if 'ReviewLog' in globals():
            ReviewLog.query.join(VocabTerm, ReviewLog.vocab_term_id == VocabTerm.id)\
                          .filter(VocabTerm.language_id == lang_id).delete(synchronize_session=False)
        
        # 2. Delete all vocabulary terms for this language
        VocabTerm.query.filter_by(language_id=lang_id).delete(synchronize_session=False)
        
        # 3. Delete all lessons for this language
        Lesson.query.filter_by(language_id=lang_id).delete(synchronize_session=False)
        
        # 4. Delete any SRS settings for this language
        SRSSettings.query.filter_by(language_id=lang_id).delete(synchronize_session=False)
        
        # 5. Finally, delete the language itself
        db.session.delete(language)
        db.session.commit()
        
        # Return success response
        return jsonify({
            "success": True, 
            "message": f'Language "{language.name}" and all associated data have been deleted.'
        })
        
    except Exception as e:
        # Rollback any database changes if an error occurs
        db.session.rollback()
        # Log the error for debugging
        app.logger.error(f"Error deleting language: {str(e)}")
        # Return error response
        return jsonify({
            "success": False, 
            "message": "An error occurred while deleting the language."
        }), 500


# -----------------------------


@app.route("/add_dictionary", methods=["POST"])
def add_dictionary():
    name = request.form.get("dictionary_name")
    url_pattern = request.form.get("dictionary_url")

    if not name or not url_pattern:
        flash("Dictionary name and URL pattern are required.", "error")
    elif "###" not in url_pattern:
        flash("URL pattern must include ### as the term placeholder.", "error")
    else:
        # Optional: Check if name or pattern already exists
        new_dict = Dictionary(name=name.strip(), url_pattern=url_pattern.strip())
        db.session.add(new_dict)
        db.session.commit()
        flash(f'Dictionary "{new_dict.name}" added successfully.', "success")

    return redirect(url_for("settings"))


@app.route("/delete_dictionary/<int:dict_id>", methods=["POST"])
def delete_dictionary(dict_id):
    dictionary = db.session.get(Dictionary, dict_id)
    if dictionary:
        # Future: Update language preferences if needed
        db.session.delete(dictionary)
        db.session.commit()
        flash(f'Dictionary "{dictionary.name}" deleted.', "success")
    else:
        flash("Dictionary not found.", "error")
    return redirect(url_for("settings"))


# --- API Endpoint to get Dictionaries FOR A LANGUAGE ---
@app.route("/api/dictionaries/<int:lang_id>")
def get_dictionaries_api(lang_id):
    language = db.session.get(Language, lang_id)
    if not language:
        return jsonify(error="Language not found"), 404

    active_ids_str = language.active_dictionary_ids or ""
    active_ids = [int(id) for id in active_ids_str.split(",") if id.isdigit()]

    if not active_ids:
        return jsonify(dictionaries=[])  # Return empty list if none selected

    # Query only the dictionaries whose IDs are in the active list
    dictionaries = (
        Dictionary.query.filter(Dictionary.id.in_(active_ids))
        .order_by(Dictionary.name)
        .all()
    )

    dict_list = [
        {"id": d.id, "name": d.name, "url_pattern": d.url_pattern} for d in dictionaries
    ]
    return jsonify(dictionaries=dict_list)


# -----------------------------------------------------


@app.route("/save_language_prefs/<int:lang_id>", methods=["POST"])
def save_language_prefs(lang_id):
    language = db.session.get(Language, lang_id)
    if not language:
        flash("Language not found.", "error")
        return redirect(url_for("settings"))

    # Get the list of submitted dictionary IDs from the checkboxes
    active_ids = request.form.getlist("active_dictionaries")
    # Convert list of IDs (strings) to a comma-separated string
    language.active_dictionary_ids = ",".join(active_ids)

    db.session.commit()
    flash(f"Dictionary preferences saved for {language.name}.", "success")
    return redirect(url_for("settings"))


# --- NEW Route to update language settings (e.g., background image) ---
@app.route("/language/<int:lang_id>/update_settings", methods=["POST"])
def update_language_settings(lang_id):
    language = db.session.get(Language, lang_id)
    if not language:
        flash("Language not found.", "error")
        return redirect(url_for("settings"))

    # Handle background image upload
    if "lang_bg_image" in request.files:
        file = request.files["lang_bg_image"]
        if file and file.filename != "" and allowed_file(file.filename):
            # Define specific upload folder for language backgrounds
            lang_bg_folder = os.path.join(app.config["UPLOAD_FOLDER"], "language_bg")
            os.makedirs(lang_bg_folder, exist_ok=True)

            # Delete old image first if it exists
            if language.card_background_image:
                try:
                    old_path = os.path.join(
                        lang_bg_folder, language.card_background_image
                    )
                    if os.path.exists(old_path):
                        os.remove(old_path)
                except OSError as e:
                    app.logger.error(
                        f"Error deleting old language background image: {e}"
                    )

            # Save new image (include lang ID for uniqueness)
            filename = secure_filename(f"lang_{language.id}_bg_{file.filename}")
            save_path = os.path.join(lang_bg_folder, filename)
            file.save(save_path)
            language.card_background_image = filename  # Update filename in DB
            db.session.commit()
            flash(f"Background image updated for {language.name}.", "success")

        elif file and file.filename != "":  # File selected but not allowed type
            flash("Invalid image file type for language background.", "error")
            # Stay on settings page if upload failed
            return redirect(url_for("settings"))
        # else: No file uploaded in this field, do nothing for the image

    # Add other language setting updates here if needed in the future

    # Redirect back to settings page
    return redirect(url_for("settings"))


# ----------------------------------------------------------------------


# --- Helper to count words (basic) ---
def count_words(text):
    # Basic split, can be improved for punctuation/edge cases
    return len(text.split())


# -----------------------------------


# --- Restore Add Lesson Routes ---
# Renamed route to avoid conflict, now ONLY handles POST
@app.route("/add_lesson/<int:lang_id>", methods=["POST"])
def add_lesson_post(lang_id):
    language = db.session.get(Language, lang_id)
    if not language:
        flash("Language not found.", "error")
        return redirect(url_for("dashboard"))

    title = request.form.get("lesson_title")
    text = request.form.get("lesson_text")
    source_url = request.form.get("lesson_source")
    youtube_url = request.form.get("youtube_url")
    audio_file = request.files.get("audio_file")
    video_file = request.files.get("video_file")  # Get video file from request

    if not title or not text:
        flash("Lesson title and text are required.", "error")
        return redirect(url_for("add_lesson_form", lang_id=lang_id))

    timestamped_text_checked = "timestamped_text" in request.form

    parsed_timestamps = []
    visible_text_lines = []
    current_timestamp_sec = None
    current_lines = []

    if timestamped_text_checked:
        import re

        # Regex to match: start of line, capture (digits) for seconds OR (digits:digits) for M:SS,
        # followed by a tab or one or more spaces, then capture the rest of the line.
        timestamp_pattern = re.compile(r"^(\d+s|\d+:\d{1,2})[\t\s]+(.*)$")

        for line in text.split("\n"):
            line = line.strip()
            if not line:
                continue  # Skip empty lines

            match = timestamp_pattern.match(line)
            if match:
                # Save previous segment
                if current_timestamp_sec is not None and current_lines:
                    segment_text = "\n".join(current_lines).strip()
                    if segment_text:
                        # Only add segment if it has text content
                        parsed_timestamps.append(
                            {"timestamp": current_timestamp_sec, "text": segment_text}
                        )
                        visible_text_lines.append(
                            segment_text
                        )  # Keep for main text content

                # Start new segment
                timestamp_str = match.group(1)
                rest_of_line = match.group(2)

                # Convert timestamp to seconds
                if timestamp_str.endswith("s"):
                    current_timestamp_sec = int(timestamp_str[:-1])
                else:
                    # M:SS format
                    parts = timestamp_str.split(":")
                    if len(parts) == 2:
                        try:
                            minutes = int(parts[0])
                            seconds = int(parts[1])
                            current_timestamp_sec = minutes * 60 + seconds
                        except ValueError:
                            # If timestamp parsing fails, treat the entire line as plain text for display
                            visible_text_lines.append(line)
                            current_timestamp_sec = (
                                None  # Reset timestamp parsing for next lines
                            )
                            current_lines = (
                                []
                            )  # Clear current lines as this segment is invalid
                            continue  # Go to next line
                    else:
                        # If unexpected format, treat the entire line as plain text for display
                        visible_text_lines.append(line)
                        current_timestamp_sec = (
                            None  # Reset timestamp parsing for next lines
                        )
                        current_lines = (
                            []
                        )  # Clear current lines as this segment is invalid
                        continue  # Go to next line

                current_lines = [rest_of_line] if rest_of_line else []

            elif current_timestamp_sec is not None:
                # This line belongs to the current segment
                current_lines.append(line)
            else:
                # This line is not part of a timestamped segment (or parsing failed for previous line)
                visible_text_lines.append(line)  # Add to main text content as is

        # Save the very last segment if parsing was active
        if current_timestamp_sec is not None and current_lines:
            segment_text = "\n".join(current_lines).strip()
            if segment_text:
                parsed_timestamps.append(
                    {"timestamp": current_timestamp_sec, "text": segment_text}
                )
                visible_text_lines.append(segment_text)  # Keep for main text content

        # Set the text_content to the collected visible lines
        text_content_to_save = "\n\n".join(
            visible_text_lines
        ).strip()  # Use double newline between segments
        timestamps_json = (
            json.dumps(parsed_timestamps, ensure_ascii=False)
            if parsed_timestamps
            else None
        )

        # --- Debug Logging ---
        app.logger.info("DEBUG: parsed_timestamps before JSON dump:")
        app.logger.info(parsed_timestamps)
        app.logger.info("DEBUG: timestamps_json length before saving:")
        app.logger.info(len(timestamps_json) if timestamps_json else 0)
        if timestamps_json and len(timestamps_json) > 100:
            app.logger.info("DEBUG: timestamps_json last 100 chars:")
            app.logger.info(timestamps_json[-100:])
        else:
            app.logger.info(
                "DEBUG: timestamps_json full string (if < 100 chars or null):"
            )
            app.logger.info(timestamps_json)
        # ---------------------

    else:
        # Checkbox not ticked, save original text as is
        text_content_to_save = text.strip()
        timestamps_json = None

    saved_media_url = None  # Use this for media_url in Lesson model
    saved_audio_filename = None  # Retain for audio_filename in Lesson model, if needed

    if video_file and video_file.filename != "":
        if allowed_file(video_file.filename):
            filename = secure_filename(video_file.filename)
            video_upload_folder = os.path.join(app.config["UPLOAD_FOLDER"], "video")
            os.makedirs(video_upload_folder, exist_ok=True)
            save_path = os.path.join(video_upload_folder, filename)
            video_file.save(save_path)
            saved_media_url = url_for(
                "static",
                filename=os.path.join("uploads", "video", filename).replace("\\", "/"),
            )  # Store full static URL with forward slashes
            saved_audio_filename = None  # Clear audio_filename if video is uploaded
        else:
            flash("Invalid video file type.", "error")
            return redirect(url_for("add_lesson_form", lang_id=lang_id))
    elif audio_file and audio_file.filename != "":  # Only check audio if no video
        if allowed_file(audio_file.filename):
            # Delete old media file (video or audio) if it exists and is different
            if lesson.media_url and os.path.exists(
                os.path.join(BASE_DIR, lesson.media_url.lstrip("/"))
            ):
                try:
                    os.remove(os.path.join(BASE_DIR, lesson.media_url.lstrip("/")))
                    app.logger.info(f"Deleted old media file: {lesson.media_url}")
                except OSError as e:
                    app.logger.error(f"Error deleting old media: {e}")

            filename = secure_filename(
                f"lesson_{lesson.id}_audio_{audio_file.filename}"
            )
            audio_upload_folder = os.path.join(app.config["UPLOAD_FOLDER"], "audio")
            os.makedirs(audio_upload_folder, exist_ok=True)
            save_path = os.path.join(audio_upload_folder, filename)
            audio_file.save(save_path)
            saved_media_url = url_for(
                "static",
                filename=os.path.join("uploads", "audio", filename).replace("\\", "/"),
            )  # Store full static URL with forward slashes
            saved_audio_filename = (
                filename  # Keep audio_filename for compatibility if needed
            )
        else:
            flash("Invalid audio file type.", "error")
            return redirect(url_for("add_lesson_form", lang_id=lang_id))

    new_lesson = Lesson(
        language_id=lang_id,
        title=title.strip(),
        text_content=text_content_to_save,  # Use the processed text
        source_url=source_url.strip() if source_url else None,
        youtube_url=youtube_url.strip() if youtube_url else None,
        media_url=saved_media_url,  # Use the new combined media URL
        audio_filename=saved_audio_filename,  # Keep audio_filename for now
        timestamps=timestamps_json,
        timestamp_offset=0.0,
        readability_score=0.0, # Will be calculated below
    )

    # Calculate readability score
    words_for_readability = get_words_for_readability(new_lesson.text_content, lang_id)
    new_lesson.readability_score = compute_readability(words_for_readability)

    db.session.add(new_lesson)
    db.session.commit()
    flash(f'Lesson "{new_lesson.title}" added.', "success")
    return redirect(url_for("language_lessons", lang_name=language.name.lower()))


# New route specifically to display the form
@app.route("/language/<int:lang_id>/add", methods=["GET"])
def add_lesson_form(lang_id):
    language = db.session.get(Language, lang_id)
    if not language:
        flash("Language not found.", "error")
        return redirect(url_for("dashboard"))
    return render_template(
        "add_lesson.html", language_name=language.name, language_id=language.id
    )


# --- End Add Lesson Routes ---


@app.route("/delete_lesson/<int:lesson_id>", methods=["POST"])
def delete_lesson(lesson_id):
    lesson = db.session.get(Lesson, lesson_id)
    if lesson:
        # Store language name before deleting for redirect
        lang_name = lesson.language.name.lower()
        db.session.delete(lesson)
        db.session.commit()
        flash(f'Lesson "{lesson.title}" deleted.', "success")
        return redirect(url_for("language_lessons", lang_name=lang_name))
    else:
        flash("Lesson not found.", "error")
        # Redirect to dashboard if lesson/language context is lost
        return redirect(url_for("dashboard"))


# --- Routes for Editing Lessons ---
@app.route("/lesson/<int:lesson_id>/edit")
def edit_lesson_form(lesson_id):
    lesson = db.session.get(Lesson, lesson_id)
    if not lesson:
        flash("Lesson not found.", "error")
        return redirect(url_for("dashboard"))
    return render_template("edit_lesson.html", lesson=lesson)


@app.route("/lesson/<int:lesson_id>/update", methods=["POST"])
def update_lesson(lesson_id):
    lesson = db.session.get(Lesson, lesson_id)
    if not lesson:
        flash("Lesson not found.", "error")
        return redirect(url_for("dashboard"))

    # Get form data
    lesson.title = request.form.get("lesson_title").strip()
    new_text = request.form.get("lesson_text").strip()
    lesson.source_url = request.form.get("lesson_source").strip() or None
    # --- Add logic to get youtube_url and handle audio ---
    # Get the URL from the form first
    youtube_url_from_form = request.form.get("youtube_url")
    # Only strip if it's not None, otherwise assign None
    lesson.youtube_url = (
        youtube_url_from_form.strip() if youtube_url_from_form else None
    )
    audio_file = request.files.get("audio_file")
    video_file = request.files.get("video_file")  # Retrieve video file from request

    # Update text content and word count if text changed
    if new_text != lesson.text_content:
        lesson.text_content = new_text
        lesson.word_count = count_words(new_text)
        # Recalculate readability score if text changed
        words_for_readability = get_words_for_readability(lesson.text_content, lesson.language_id)
        lesson.readability_score = compute_readability(words_for_readability)
        # Future: Invalidate/reset word statuses for this lesson?!

    # Handle optional media upload (video takes precedence over audio)
    saved_media_url = lesson.media_url  # Keep existing if no new upload
    saved_audio_filename = lesson.audio_filename  # Keep existing for now

    if video_file and video_file.filename != "":
        if allowed_file(video_file.filename):
            # Delete old media file (video or audio) if it exists
            if lesson.media_url and os.path.exists(
                os.path.join(BASE_DIR, lesson.media_url.lstrip("/"))
            ):
                try:
                    os.remove(os.path.join(BASE_DIR, lesson.media_url.lstrip("/")))
                    app.logger.info(f"Deleted old media file: {lesson.media_url}")
                except OSError as e:
                    app.logger.error(f"Error deleting old media: {e}")

            filename = secure_filename(
                f"lesson_{lesson.id}_video_{video_file.filename}"
            )
            video_upload_folder = os.path.join(app.config["UPLOAD_FOLDER"], "video")
            os.makedirs(video_upload_folder, exist_ok=True)
            save_path = os.path.join(video_upload_folder, filename)
            video_file.save(save_path)
            saved_media_url = url_for(
                "static",
                filename=os.path.join("uploads", "video", filename).replace("\\", "/"),
            )
            saved_audio_filename = None  # Clear audio_filename if video is uploaded
        else:
            flash("Invalid video file type.", "error")
            return render_template("edit_lesson.html", lesson=lesson)
    elif (
        audio_file and audio_file.filename != ""
    ):  # Only process audio if no video uploaded
        if allowed_file(audio_file.filename):
            # Delete old media file (video or audio) if it exists and is different
            if lesson.media_url and os.path.exists(
                os.path.join(BASE_DIR, lesson.media_url.lstrip("/"))
            ):
                try:
                    os.remove(os.path.join(BASE_DIR, lesson.media_url.lstrip("/")))
                    app.logger.info(f"Deleted old media file: {lesson.media_url}")
                except OSError as e:
                    app.logger.error(f"Error deleting old media: {e}")

            filename = secure_filename(
                f"lesson_{lesson.id}_audio_{audio_file.filename}"
            )
            audio_upload_folder = os.path.join(app.config["UPLOAD_FOLDER"], "audio")
            os.makedirs(audio_upload_folder, exist_ok=True)
            save_path = os.path.join(audio_upload_folder, filename)
            audio_file.save(save_path)
            saved_media_url = url_for(
                "static",
                filename=os.path.join("uploads", "audio", filename).replace("\\", "/"),
            )
            saved_audio_filename = (
                filename  # Keep audio_filename for compatibility if needed
            )
        else:
            flash("Invalid audio file type.", "error")
            return render_template("edit_lesson.html", lesson=lesson)
    elif "clear_media" in request.form:  # Handle explicit media clear
        if lesson.media_url and os.path.exists(
            os.path.join(BASE_DIR, lesson.media_url.lstrip("/"))
        ):
            try:
                os.remove(os.path.join(BASE_DIR, lesson.media_url.lstrip("/")))
                app.logger.info(f"Deleted old media file on clear: {lesson.media_url}")
            except OSError as e:
                app.logger.error(f"Error deleting old media on clear: {e}")
        saved_media_url = None
        saved_audio_filename = None  # Clear if audio filename was also stored

    # Update lesson object with new media info
    lesson.media_url = saved_media_url
    lesson.audio_filename = saved_audio_filename  # Update for compatibility

    # Handle optional image upload
    if "lesson_image" in request.files:
        file = request.files["lesson_image"]
        if file and file.filename != "" and allowed_file(file.filename):
            # Delete old image file first if it exists
            if lesson.image_filename:
                try:
                    old_path = os.path.join(
                        app.config["UPLOAD_FOLDER"], lesson.image_filename
                    )
                    if os.path.exists(old_path):
                        os.remove(old_path)
                except OSError as e:
                    print(f"Error deleting old image: {e}")  # Log error

            # Save new image
            filename = secure_filename(
                f"lesson_{lesson.id}_{file.filename}"
            )  # Add ID to filename
            save_path = os.path.join(app.config["UPLOAD_FOLDER"], filename)
            file.save(save_path)
            lesson.image_filename = filename  # Update filename in DB
            db.session.commit()
            flash(f"Background image updated for {lesson.title}.", "success")

        elif file and file.filename != "":  # File selected but not allowed type
            flash("Invalid image file type for lesson background.", "error")
            # Render edit form again instead of redirecting immediately
            return render_template("edit_lesson.html", lesson=lesson)

    if not lesson.title or not lesson.text_content:
        flash("Lesson title and text cannot be empty.", "error")
        return render_template("edit_lesson.html", lesson=lesson)
    else:
        # --- Debug Print before commit ---
        print(
            f"DEBUG: Saving lesson {lesson_id}. YouTube URL being set to: {lesson.youtube_url}"
        )
        db.session.commit()
        flash(f'Lesson "{lesson.title}" updated.', "success")
        return redirect(
            url_for("language_lessons", lang_name=lesson.language.name.lower())
        )


# ---------------------------------


# --- Restore Vocab API Routes ---
# --- API Endpoint to get vocabulary status for a list of terms ---
@app.route("/api/vocab/<int:lang_id>", methods=["POST"])
def get_vocab_status(lang_id):
    data = request.get_json()
    if not data or "terms" not in data:
        return jsonify(error="Missing terms data"), 400

    terms_list = data["terms"]
    if not isinstance(terms_list, list):
        return jsonify(error="Terms data must be a list"), 400

    language = db.session.get(Language, lang_id)
    if not language:
        return jsonify(error="Language not found"), 404

    vocab_data = (
        db.session.query(
            VocabTerm.term, VocabTerm.status, VocabTerm.translation
        )
        .filter(
            VocabTerm.language_id == lang_id,
            VocabTerm.term.in_([t.lower() for t in terms_list]),
        )
        .all()
    )

    vocab_dict = {
        row.term: {"status": row.status, "translation": row.translation}
        for row in vocab_data
    }

    result_dict = {}
    for term in terms_list:
        lower_term = term.lower()
        if lower_term in vocab_dict:
            result_dict[term] = vocab_dict[lower_term]
        else:
            result_dict[term] = {"status": 0, "translation": None}

    return jsonify(vocab=result_dict)


# --- API Endpoint to UPDATE vocabulary status/translation ---
@app.route("/api/vocab/update", methods=["POST"])
def update_vocab_term():
    data = request.get_json()
    if not data or "term" not in data or "lang_id" not in data:
        return jsonify(error="Missing required data (term, lang_id)"), 400

    original_term = data["term"]  # Keep original case for potential use
    lang_id = data["lang_id"]
    new_status_str = data.get("status")
    translation = data.get("translation")
    sentence = data.get("sentence")  # Get optional sentence
    lesson_id = data.get("lesson_id")  # Get optional lesson_id

    # Define status constants globally
    STATUS_UNKNOWN = 0
    STATUS_LEVEL_1 = 1
    STATUS_LEVEL_2 = 2
    STATUS_LEVEL_3 = 3
    STATUS_LEVEL_4 = 4
    STATUS_LEVEL_5 = 5
    STATUS_KNOWN = 6
    STATUS_IGNORED = 7

    LEARNING_STATUSES = [
        STATUS_LEVEL_1,
        STATUS_LEVEL_2,
        STATUS_LEVEL_3,
        STATUS_LEVEL_4,
        STATUS_LEVEL_5,
    ]

    try:
        lower_term = original_term.lower().strip()  # Use lowercase for lookup/storage
        if not lower_term:
            return jsonify(error="Term cannot be empty"), 400

        vocab_entry = VocabTerm.query.filter_by(
            language_id=lang_id, term=lower_term
        ).first()

        new_status = None
        if new_status_str is not None:
            try:
                new_status = int(new_status_str)
                if not (0 <= new_status <= 7):  # Assuming status 7 is Ignored
                    raise ValueError("Invalid status value")
            except ValueError as e:
                return jsonify(error=f"Invalid status format: {e}"), 400

        if vocab_entry:
            # Update existing entry
            current_status = vocab_entry.status
            updated = False
            if new_status is not None and new_status != current_status:
                vocab_entry.status = new_status
                updated = True

            # Always update translation if provided and different
            if translation is not None and translation != vocab_entry.translation:
                vocab_entry.translation = translation.strip()
                updated = True

            # NEW: If context_sentence is empty, try to get it from lesson_id and text
            # Only attempt if lesson_id is provided and context_sentence is currently empty
            if lesson_id is not None and not vocab_entry.context_sentence:
                lesson = db.session.get(Lesson, lesson_id)
                if lesson and lesson.text_content:
                    language = Language.query.get(lang_id)
                    if language and language.spacy_model_status == "available":
                        nlp = get_spacy_model(language.name)
                        if nlp:
                            doc = nlp(lesson.text_content)
                            found_sentence = None
                            for sent in doc.sents:
                                # Check if the lowercased original term (or lemma) is in the sentence
                                if original_term.lower() in sent.text.lower():
                                    found_sentence = sent.text.strip()
                                    break
                            if found_sentence:
                                vocab_entry.context_sentence = found_sentence
                                updated = True
                                print(
                                    f"Extracted context sentence for '{original_term}': '{found_sentence}'"
                                )
                            else:
                                print(
                                    f"No context sentence found for '{original_term}' in lesson {lesson_id}"
                                )
                        else:
                            print(
                                f"SpaCy model not loaded for language '{language.name}'. Cannot extract context sentence."
                            )
                    else:
                        print(
                            f"SpaCy model not available for language '{language.name}'. Status: {language.spacy_model_status}. Cannot extract context sentence."
                        )
                else:
                    print(
                        f"Lesson {lesson_id} not found or no text content for context sentence extraction."
                    )

            # ONLY automatically set status to Level 1 if an UNKNOWN word gets a translation
            # and no specific new_status was provided (or it was also UNKNOWN).
            # This prevents automatically advancing levels when just changing translation.
            if (
                current_status == STATUS_UNKNOWN
                and (new_status is None or new_status == STATUS_UNKNOWN)
                and translation
            ):
                vocab_entry.status = STATUS_LEVEL_1
                updated = True

            if updated:
                db.session.commit()
                return jsonify(
                    success=True,
                    term=original_term,
                    status=vocab_entry.status,
                    translation=vocab_entry.translation,
                )
            else:
                return jsonify(
                    success=True,
                    message="No changes detected",
                    term=original_term,
                    status=current_status,
                    translation=vocab_entry.translation,
                )

        else:
            # Create new entry - THIS IS WHERE LEMMATIZATION AND CONTEXT EXTRACTION HAPPEN
            # Default to UNKNOWN status (blue highlight)
            final_status = STATUS_UNKNOWN

            # If a translation is provided, default to Level 1 (red highlight)
            if translation is not None and translation.strip() != '':
                final_status = STATUS_LEVEL_1

            # If a specific status was explicitly selected, use that instead
            if new_status is not None and new_status != STATUS_UNKNOWN:
                final_status = new_status

            # --- Lemmatization Logic and Context Sentence Extraction ---
            language = db.session.get(Language, lang_id) # Use db.session.get for direct primary key lookup
            lemma = lower_term  # Default lemma is the lowercase term
            extracted_context_sentence = None  # Initialize for new entry

            # Perform lemmatization and context extraction if language model is available
            if language and language.spacy_model_status == "available":
                nlp = get_spacy_model(language.name)
                if nlp:
                    # Lemmatization
                    doc = nlp(original_term.strip())
                    if doc and len(doc) > 0:
                        found_lemma = doc[0].lemma_
                        if found_lemma and found_lemma != "-PRON-": # Avoid generic pronoun lemmas
                            lemma = found_lemma.lower()
                        print(f"Lemmatized '{original_term}' to '{lemma}' for language '{language.name}'")
                    else:
                        print(f"spaCy could not process term: '{original_term}'")

                    # Extract context sentence if lesson_id provided and sentence is not already set
                    if lesson_id is not None and not sentence: # Only try to extract if frontend didn't provide it
                        lesson = db.session.get(Lesson, lesson_id)
                        if lesson and lesson.text_content:
                            lesson_doc = nlp(lesson.text_content)
                            for sent in lesson_doc.sents:
                                if original_term.lower() in sent.text.lower():
                                    extracted_context_sentence = sent.text.strip()
                                    print(f"Extracted context sentence for NEW term '{original_term}': '{extracted_context_sentence}'")
                                    break
                            if not extracted_context_sentence:
                                print(f"No context sentence found for NEW term '{original_term}' in lesson {lesson_id}")
                        else:
                            print(f"Lesson {lesson_id} not found or no text content for context sentence extraction.")
                else:
                    print(f"SpaCy model not loaded for language '{language.name}'. Cannot perform lemmatization or extract context sentence.")
            else:
                print(f"SpaCy model not available for language '{language.name}'. Status: {language.spacy_model_status}. Cannot perform lemmatization or extract context sentence.")

            # Create a new term entry in the database
            new_entry = VocabTerm(
                language_id=lang_id,
                term=lower_term, # Store the specific term that was saved
                lemma=lemma,     # Store its lemma
                status=final_status,
                translation=translation.strip() if translation else None,
                context_sentence=extracted_context_sentence if extracted_context_sentence else sentence, # Prefer extracted, fallback to provided
                next_review_date=datetime.utcnow(),
                interval=0,
                ease_factor=2.5,
                difficulty=0.0,
                stability=0.0,
                reviews=0,
                lapses=0,
                state="new"
            )

            db.session.add(new_entry)
            db.session.commit()
            return jsonify(
                success=True,
                term=original_term,
                status=new_entry.status,
                translation=new_entry.translation,
            )

    except IntegrityError as e:
        db.session.rollback()
        app.logger.error(
            f"Database integrity error updating term '{original_term}': {e}"
        )
        # Check if this is a UNIQUE constraint violation on (language_id, lemma)
        if "UNIQUE constraint failed: vocab_term.language_id, vocab_term.lemma" in str(e):
            return jsonify(
                error=f"A term with the base form '{lemma}' already exists in your vocabulary.",
                term=original_term,
                status=409
            ), 409
        return (
            jsonify(error="A database error occurred while saving the term."),
            500,
        )
    except Exception as e:
        db.session.rollback()
        app.logger.error(f"Unexpected error updating term '{original_term}': {e}")
        return jsonify(error="An unexpected server error occurred."), 500


# --- End Restore Vocab API Routes ---


# --- API Endpoint to get ALL MULTI-WORD vocabulary terms for a language ---
@app.route("/api/multiword-terms/<int:lang_id>", methods=["GET"])
def get_multiword_terms(lang_id):
    # Query for terms containing at least one space
    # Adjust this logic if multi-word terms can be defined differently
    multiword_terms = (
        VocabTerm.query.filter(
            VocabTerm.language_id == lang_id,
            VocabTerm.term.contains(" "),  # Simple check for spaces
        )
        .order_by(db.func.length(VocabTerm.term).desc())
        .all()
    )  # Order by length descending

    terms_data = [
        {"term": term.term, "status": term.status, "translation": term.translation}
        for term in multiword_terms
    ]
    return jsonify(multiword_terms=terms_data)


# ---------------------------------------------------------------------


# --- API Endpoint to get Known Word Count (Status >= 4) ---
@app.route("/api/known_word_count/<int:lang_id>", methods=["GET"])
def get_known_word_count(lang_id):
    language = db.session.get(Language, lang_id)
    if not language:
        return jsonify(error="Language not found"), 404

    known_count = (
        db.session.query(func.count(VocabTerm.term.distinct()))
        .filter(VocabTerm.language_id == lang_id, VocabTerm.status >= 4)
        .scalar()
        or 0
    )

    return jsonify(language_id=lang_id, known_word_count=known_count)


# --- End Known Word Count API ---

# --- SRS / Review API Endpoints ---

# Constants for custom status levels
STATUS_UNKNOWN = 0
STATUS_LEVEL_1 = 1
STATUS_LEVEL_2 = 2
STATUS_LEVEL_3 = 3
STATUS_LEVEL_4 = 4
STATUS_LEVEL_5 = 5
STATUS_KNOWN = 6
STATUS_IGNORED = 7

# Map FSRS states to legacy status for display
FSRS_STATE_TO_STATUS = {
    "learning": STATUS_LEVEL_1,  # New cards start in learning state
    "review": STATUS_KNOWN,
    "relearning": STATUS_LEVEL_1,
}

# Map string states to FSRS State enum
STATE_MAP = {
    "new": State.Learning,  # New cards map to Learning state
    "learning": State.Learning,
    "review": State.Review,
    "relearning": State.Relearning,
}

# Constants for review ratings
RATING_AGAIN = "again"
RATING_HARD = "hard"
RATING_GOOD = "good"
RATING_EASY = "easy"

# Map string ratings to FSRS Rating enum
RATING_MAP = {
    RATING_AGAIN: Rating.Again,
    RATING_HARD: Rating.Hard,
    RATING_GOOD: Rating.Good,
    RATING_EASY: Rating.Easy,
}


@app.route("/api/review/<int:lang_id>", methods=["GET"])
def get_review_cards(lang_id):
    language = db.session.get(Language, lang_id)
    if not language:
        return jsonify(error="Language not found"), 404

    # Get SRS settings for the language
    srs_settings = SRSSettings.query.filter_by(language_id=lang_id).first()
    if not srs_settings:
        srs_settings = SRSSettings(language_id=lang_id)
        db.session.add(srs_settings)
        db.session.commit()

    now = datetime.now(timezone.utc)
    app.logger.info(
        f"DEBUG: get_review_cards called for lang_id={lang_id}. Current UTC time: {now}"
    )

    # Fetch cards with status between 1 and 5 (inclusive) for review
    # FSRS will handle next review date, but we filter based on custom status here
    review_terms_query = VocabTerm.query.filter(
        VocabTerm.language_id == lang_id,
        VocabTerm.status.in_([STATUS_LEVEL_1, STATUS_LEVEL_2, STATUS_LEVEL_3, STATUS_LEVEL_4, STATUS_LEVEL_5]),
        VocabTerm.next_review_date <= now, # Only due cards
    ).order_by(VocabTerm.next_review_date)

    # Prioritize 'learning' state cards if they fall within the status range
    # and then 'review' and 'relearning' states.
    # This ensures new cards (status 1) are shown first if due.
    due_review_cards = review_terms_query.limit(srs_settings.max_reviews_per_day).all()

    app.logger.info(
        f"DEBUG: Due review cards found ({len(due_review_cards)}): {[t.term for t in due_review_cards]}"
    )

    review_cards_data = []
    for term in due_review_cards:
        # Determine direction based on custom status
        current_direction = "ru_to_en"
        if term.status >= STATUS_LEVEL_3:
            # For Level 3 and above, randomly choose direction
            current_direction = random.choice(["ru_to_en", "en_to_ru"])
        
        review_cards_data.append(
            {
                "id": term.id,
                "term": term.term,
                "translation": term.translation,
                "context_sentence": term.context_sentence,
                "status": term.status, # Send custom status, not FSRS state
                "direction": current_direction, 
            }
        )

    return jsonify(review_cards=review_cards_data)


@app.route("/api/review/update", methods=["POST"])
def update_review_card():
    data = request.get_json()
    if (
        not data
        or "term_id" not in data
        or "rating" not in data
        or "direction" not in data
    ):
        return jsonify(error="Missing required data (term_id, rating, direction)"), 400

    term_id = data["term_id"]
    rating_str = data["rating"]
    direction = data["direction"]

    term = db.session.get(VocabTerm, term_id)
    if not term:
        return jsonify(error="Term not found"), 404

    # Get FSRS rating
    rating = RATING_MAP.get(rating_str)
    if rating is None:
        return jsonify(error="Invalid rating provided"), 400

    today = datetime.now(timezone.utc)

    # Calculate elapsed days
    elapsed_days = 0
    if term.last_review_date:
        # Ensure term.last_review_date is timezone-aware (assume UTC if naive)
        aware_last_review_date = term.last_review_date
        if term.last_review_date.tzinfo is None:
            aware_last_review_date = term.last_review_date.replace(tzinfo=timezone.utc)

        elapsed_days = (today - aware_last_review_date).days
        if elapsed_days < 0:
            elapsed_days = 0

    # Create FSRS card
    card = Card()

    # Set card attributes based on current term state for FSRS calculation
    card.due = term.next_review_date or today
    card.stability = max(term.stability, 0.1)  # Ensure minimum stability of 0.1
    card.difficulty = term.difficulty
    card.elapsed_days = elapsed_days
    card.lapses = term.lapses
    card.reps = term.reviews
    card.state = STATE_MAP.get(
        term.state, State.Learning
    )  # Use STATE_MAP with Learning as default

    # Review the card with FSRS
    card, review_log = scheduler.review_card(card, rating)

    # Update VocabTerm with FSRS results for scheduling
    term.difficulty = card.difficulty
    term.stability = card.stability
    term.reviews = card.reps
    term.lapses = card.lapses
    term.state = card.state.name.lower() # Store FSRS state for internal tracking
    term.interval = (card.due - today).days
    term.next_review_date = card.due
    term.last_review_date = today
    term.last_reviewed_direction = direction

    # --- Custom Leveling Logic (overrides FSRS status for display/custom behavior) ---
    old_status = term.status # Store current status for comparison
    new_status = old_status # Initialize new status to current

    # Handle 'Easy' rating: card becomes Known (level 6)
    if rating_str == RATING_EASY:
        new_status = STATUS_KNOWN # Level 6
    # Handle 'Good' rating: advance one level if not already known/ignored
    elif rating_str == RATING_GOOD:
        if term.status >= STATUS_LEVEL_1 and term.status < STATUS_LEVEL_5:
            new_status = term.status + 1
        elif term.status == STATUS_UNKNOWN: # Should not happen if filtered, but as fallback
            new_status = STATUS_LEVEL_1
    # Handle 'Hard' rating: status stays the same
    elif rating_str == RATING_HARD:
        pass # new_status remains old_status
    # Handle 'Again' rating: decrease level on consecutive 'Again', otherwise status stays the same
    elif rating_str == RATING_AGAIN:
        if term.last_rating_type == RATING_AGAIN: # Check for consecutive 'Again'
            if term.status > STATUS_LEVEL_1 and term.status <= STATUS_KNOWN:
                new_status = term.status - 1 # Decrease level
            elif term.status == STATUS_UNKNOWN or term.status == STATUS_IGNORED or term.status == STATUS_KNOWN: # If unknown/ignored/known, revert to level 1
                new_status = STATUS_LEVEL_1
        # If not consecutive 'Again', new_status remains old_status (pass)

    term.status = new_status # Apply the determined new status

    # Store the current rating type for the next review
    term.last_rating_type = rating_str

    db.session.commit()
    return jsonify(success=True, new_status=term.status)


# --- End SRS / Review API Endpoints ---


# --- Debug Route for VocabTerm Data ---
@app.route("/debug/cards/<int:lang_id>", methods=["GET"])
def debug_cards(lang_id):
    terms = VocabTerm.query.filter_by(language_id=lang_id).all()
    card_data = []
    for term in terms:
        card_data.append(
            {
                "id": term.id,
                "term": term.term,
                "next_review_date": (
                    term.next_review_date.isoformat() if term.next_review_date else None
                ),
                "last_review_date": (
                    term.last_review_date.isoformat() if term.last_review_date else None
                ),
                "state": term.state,
                "difficulty": term.difficulty,
                "stability": term.stability,
                "reviews": term.reviews,
                "lapses": term.lapses,
                "status": term.status,  # old status
            }
        )
    return jsonify(card_data)


# --- End Debug Route ---


# --- Temporary Backfill Route for FSRS Data ---
@app.route("/backfill_fsrs_data")
def backfill_fsrs_data():
    """Backfill FSRS data for existing terms that haven't been processed by FSRS yet."""
    terms = VocabTerm.query.all()
    updated_count = 0
    now = datetime.now(timezone.utc)

    for term in terms:
        # Check if FSRS fields are at their default/initial state, indicating not yet processed by FSRS
        is_fsrs_uninitialized = (
            term.state == "new"  # Check for the database default string 'new'
            and term.difficulty == 5.0  # Use the actual default initial difficulty
            and term.stability == 0.0  # Use the actual default initial stability
            and term.reviews == 0
            and term.lapses == 0
        )

        if is_fsrs_uninitialized:
            # Initialize FSRS fields based on legacy status
            if term.status == STATUS_UNKNOWN:
                term.state = "learning"
                term.difficulty = 5.0  # Set to default initial difficulty
                term.stability = 0.0  # Set to default initial stability
                term.reviews = 0
                term.lapses = 0
                term.next_review_date = now
                updated_count += 1
            elif term.status in [
                STATUS_LEVEL_1,
                STATUS_LEVEL_2,
                STATUS_LEVEL_3,
                STATUS_LEVEL_4,
                STATUS_LEVEL_5,
            ]:
                term.state = "learning"
                term.difficulty = 5.0  # Set to default initial difficulty
                term.stability = 0.0  # Set to default initial stability
                if term.next_review_date is None:
                    term.next_review_date = now
                updated_count += 1
            elif term.status == STATUS_KNOWN:
                term.state = "review"
                term.difficulty = 5.0
                term.stability = 10.0
                if term.next_review_date is None:
                    term.next_review_date = now
                updated_count += 1
            elif term.status == STATUS_IGNORED:
                term.state = "ignored"
                term.next_review_date = None
                term.difficulty = 0.0
                term.stability = 0.0
                term.reviews = 0
                term.lapses = 0
        updated_count += 1

    db.session.commit()
    return f"Backfilled {updated_count} terms with initial FSRS data."


# --- End Temporary Backfill Route ---


# --- Frontend Route for Review Page ---
@app.route("/review/<int:lang_id>")
def review_language(lang_id):
    # Optional: Add permission check if users are implemented
    language = db.session.get(Language, lang_id)
    if not language:
        flash(f"Language with ID {lang_id} not found.", "error")
        return redirect(url_for("dashboard"))

    # The template will fetch the actual cards via JavaScript API call
    return render_template("review.html", language=language)


# --- End Frontend Review Route ---


# --- Route for Selecting Language to Review ---
@app.route("/review")
def review_select_language():
    languages = Language.query.order_by(Language.name).all()

    # Optional Enhancement: Calculate due card count for each language here
    now = datetime.utcnow()
    for lang in languages:
        due_count = VocabTerm.query.filter(
            VocabTerm.language_id == lang.id,
            VocabTerm.state.in_(["learning", "review", "relearning"]),
            VocabTerm.next_review_date <= now,
        ).count()
        lang.due_review_count = due_count  # Assign count directly to the object

    return render_template("review_select.html", languages=languages)


# --- End Select Language Route ---


# --- Vocabulary Export Route ---
@app.route("/export/vocab/<int:lang_id>")
def export_vocab(lang_id):
    language = db.session.get(Language, lang_id)
    if not language:
        flash(f"Language with ID {lang_id} not found.", "error")
        return redirect(url_for("settings"))

    vocab_terms = (
        VocabTerm.query.filter_by(language_id=lang_id).order_by(VocabTerm.term).all()
    )

    # --- Create CSV in memory ---
    output = io.StringIO()  # Use StringIO to write CSV to a string buffer
    writer = csv.writer(output)

    # Write header row
    header = [
        "Term",
        "Translation",
        "Status",
        "ContextSentence",
        "IntervalDays",
        "NextReviewDate",
        "EaseFactor",
    ]
    writer.writerow(header)

    # Write data rows
    for term in vocab_terms:
        row = [
            term.term,
            term.translation or "",
            term.status,
            term.context_sentence or "",
            term.interval,
            (
                term.next_review_date.strftime("%Y-%m-%d %H:%M:%S")
                if term.next_review_date
                else ""
            ),  # Format date
            term.ease_factor,
        ]
        writer.writerow(row)

    output.seek(0)  # Reset buffer position to the beginning
    # --- End Create CSV ---

    # --- Prepare Response ---
    # Create filename, sanitize language name
    safe_lang_name = "".join(
        c for c in language.name if c.isalnum() or c in (" ", "-")
    ).rstrip()
    filename = f"{safe_lang_name}_vocab.csv"

    return Response(
        output,
        mimetype="text/csv",
        headers={"Content-Disposition": f"attachment;filename={filename}"},
    )


# --- End Export Route ---


# --- Known Lemmas Export Route ---
@app.route("/export/known-lemmas/<int:lang_id>")
def export_known_lemmas(lang_id):
    try:
        language = db.session.get(Language, lang_id)
        if not language:
            flash(f"Language with ID {lang_id} not found.", "error")
            return redirect(url_for("settings"))

        # Query for known lemmas (status=6)
        known_lemmas = db.session.query(
            VocabTerm.term.label('term'),
            VocabTerm.lemma.label('lemma'),
            db.func.group_concat(VocabTerm.translation.distinct()).label('translations')
        ).filter(
            VocabTerm.language_id == lang_id,
            VocabTerm.status == 6,  # Known status
            db.or_(
                VocabTerm.lemma.isnot(None),
                VocabTerm.term.isnot(None)
            )
        ).group_by(
            db.func.ifnull(VocabTerm.lemma, VocabTerm.term)
        ).order_by(
            db.func.ifnull(VocabTerm.lemma, VocabTerm.term)
        ).all()

        if not known_lemmas:
            flash(f"No known lemmas found for {language.name}.", "info")
            return redirect(url_for("settings"))

        # Create a pandas DataFrame
        import pandas as pd
        
        # Convert query results to list of dicts for DataFrame
        data = [{
            'Term': item.term,
            'Lemma': item.lemma if item.lemma else item.term,  # Fallback to term if lemma is None
            'Translation': item.translations or 'No translation available'
        } for item in known_lemmas]
        
        # Create DataFrame with selected columns
        df = pd.DataFrame(data, columns=['Term', 'Lemma', 'Translation'])
        
        # Create a response with Excel file
        from io import BytesIO
        output = BytesIO()
        
        # Create Excel writer and write data
        with pd.ExcelWriter(output, engine='openpyxl') as writer:
            df.to_excel(writer, index=False, sheet_name='Known Lemmas')
            
            # Auto-adjust column widths
            worksheet = writer.sheets['Known Lemmas']
            for idx, col in enumerate(df.columns):
                # Handle potential None values in the column
                col_lengths = df[col].astype(str).apply(len)
                max_length = max(col_lengths.max(), len(col)) + 2
                # Cap the width at 50 characters
                worksheet.column_dimensions[chr(65 + idx)].width = min(max_length, 50)
        
        output.seek(0)
        
        # Create filename
        safe_lang_name = "".join(
            c for c in language.name if c.isalnum() or c in (" ", "-")
        ).rstrip()
        filename = f"{safe_lang_name}_known_lemmas.xlsx"
        
        return Response(
            output,
            mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f"attachment;filename={filename}"},
        )
    except Exception as e:
        # Removed temporary print statement
        current_app.logger.exception("Error exporting known lemmas") # Log full traceback
        flash("An error occurred while exporting known lemmas. Please try again.", "error")
        return redirect(url_for("settings"))

# --- End Known Lemmas Export Route ---


# --- Vocabulary Import Route ---
@app.route("/import/vocab/<int:lang_id>", methods=["POST"])
def import_vocab(lang_id):
    language = db.session.get(Language, lang_id)
    if not language:
        flash(f"Language with ID {lang_id} not found.", "error")
        return redirect(url_for("settings"))

    # --- Check for file ---
    if "vocab_file" not in request.files:
        flash("No file part in the request.", "error")
        return redirect(url_for("settings"))

    file = request.files["vocab_file"]
    if file.filename == "":
        flash("No file selected for upload.", "error")
        return redirect(url_for("settings"))

    if not file or not file.filename.lower().endswith(".csv"):
        flash("Invalid file type. Please upload a .csv file.", "error")
        return redirect(url_for("settings"))
    # --- End Check for file ---

    # --- Process CSV ---
    imported_count = 0
    updated_count = 0
    skipped_count = 0
    error_count = 0

    try:
        # Read the file stream directly without saving
        stream = io.StringIO(file.stream.read().decode("UTF8"), newline=None)
        csv_reader = csv.reader(stream)

        header = next(csv_reader, None)  # Read header row
        if (
            not header or len(header) < 3
        ):  # Basic check for expected columns (Term, Translation, Status)
            flash(
                "Invalid CSV format. Missing required header columns (Term, Translation, Status).",
                "error",
            )
            return redirect(url_for("settings"))

        # Map header names to indices (flexible column order)
        # Using lower case and stripping potential BOM/whitespace
        header_map = {
            col.lower().strip().replace("\ufeff", ""): idx
            for idx, col in enumerate(header)
        }

        required_cols = ["term", "translation", "status"]
        if not all(col in header_map for col in required_cols):
            flash(f"Missing one or more required columns: {required_cols}", "error")
            return redirect(url_for("settings"))

        term_idx = header_map["term"]
        trans_idx = header_map["translation"]
        status_idx = header_map["status"]
        # Optional columns
        context_idx = header_map.get("contextsentence")  # lowercase
        interval_idx = header_map.get("intervaldays")
        next_review_idx = header_map.get("nextreviewdate")
        ease_idx = header_map.get("easefactor")

        # --- Load existing terms for this language into a dict for quick lookup ---
        existing_terms = {
            vt.term: vt for vt in VocabTerm.query.filter_by(language_id=lang_id).all()
        }

        for row in csv_reader:
            try:
                if len(row) <= max(term_idx, trans_idx, status_idx):
                    skipped_count += 1  # Skip rows that don't have enough columns
                    continue

                term_str = row[term_idx].strip()
                if not term_str:  # Skip rows with empty terms
                    skipped_count += 1
                    continue

                lower_term = term_str.lower()
                translation_str = row[trans_idx].strip()
                status_int = int(row[status_idx].strip())

                # Basic status validation
                if not (0 <= status_int <= 7):
                    status_int = 0  # Default to unknown if invalid

                # --- Get optional fields safely ---
                context_str = (
                    row[context_idx].strip()
                    if context_idx is not None and context_idx < len(row)
                    else None
                )
                interval_int = (
                    int(row[interval_idx].strip())
                    if interval_idx is not None
                    and interval_idx < len(row)
                    and row[interval_idx].strip().isdigit()
                    else 0
                )
                ease_float = (
                    float(row[ease_idx].strip())
                    if ease_idx is not None
                    and ease_idx < len(row)
                    and row[ease_idx].strip()
                    else 2.5
                )
                next_review_dt = None
                if (
                    next_review_idx is not None
                    and next_review_idx < len(row)
                    and row[next_review_idx].strip()
                ):
                    try:
                        next_review_dt = datetime.strptime(
                            row[next_review_idx].strip(), "%Y-%m-%d %H:%M:%S"
                        )
                    except ValueError:
                        next_review_dt = datetime.utcnow()  # Default if parse fails
                else:
                    next_review_dt = datetime.utcnow()  # Default if empty

                # Check if term exists
                if lower_term in existing_terms:
                    # Update existing term
                    existing_term = existing_terms[lower_term]
                    # Update logic: Overwrite with imported values for now
                    existing_term.translation = translation_str
                    existing_term.status = status_int
                    existing_term.context_sentence = (
                        context_str if context_str else existing_term.context_sentence
                    )  # Only update context if provided
                    existing_term.interval = interval_int
                    existing_term.ease_factor = ease_float
                    existing_term.next_review_date = next_review_dt
                    updated_count += 1
                else:
                    # Create new term
                    new_term = VocabTerm(
                        language_id=lang_id,
                        term=lower_term,  # Store lowercase
                        lemma=lower_term,  # Default lemma
                        translation=translation_str,
                        status=status_int,
                        context_sentence=context_str,
                        interval=interval_int,
                        ease_factor=ease_float,
                        next_review_date=next_review_dt,
                    )
                    db.session.add(new_term)
                    existing_terms[lower_term] = (
                        new_term  # Add to dict to handle duplicates within the file
                    )
                    imported_count += 1

            except Exception as row_error:
                print(f"Error processing row: {row} - {row_error}")  # Log error
                error_count += 1
                db.session.rollback()  # Rollback potential partial add for this row

        # Commit all changes at the end
        db.session.commit()
        flash(
            f"Import complete for {language.name}. Added: {imported_count}, Updated: {updated_count}, Skipped: {skipped_count}, Errors: {error_count}",
            "success",
        )

    except Exception as e:
        db.session.rollback()
        flash(f"An error occurred during import: {e}", "error")
        print(f"Import Error: {e}")  # Log the error

    return redirect(url_for("settings"))


# --- End Import Route ---


# --- Route to Update SRS Settings ---
@app.route("/update_srs_settings/<int:lang_id>", methods=["POST"])
def update_srs_settings(lang_id):
    language = db.session.get(Language, lang_id)
    if not language:
        flash(f"Language not found for ID {lang_id}.", "error")
        return redirect(url_for("settings"))

    # --- Get OR CREATE SRS Settings ---
    srs = language.srs_settings  # Try to get existing settings
    if not srs:
        # If no settings exist (e.g., for older languages), create them now
        app.logger.info(
            f"No SRS settings found for lang ID {lang_id}. Creating default settings."
        )
        srs = SRSSettings(language_id=lang_id)  # Create with defaults
        db.session.add(srs)
        # We might need to flush here if we immediately use srs object below
        # db.session.flush()
    # --- End Get OR CREATE ---

    # Now 'srs' is guaranteed to be a valid SRSSettings object
    try:
        # Update fields from form data, converting percentages back to floats
        srs.new_cards_per_day = int(request.form.get("new_cards_per_day", 20))
        srs.max_reviews_per_day = int(request.form.get("max_reviews_per_day", 200))
        srs.learning_steps = request.form.get("learning_steps", "1 10")
        srs.graduating_interval = int(request.form.get("graduating_interval", 1))
        srs.easy_interval = int(request.form.get("easy_interval", 4))
        srs.starting_ease = float(request.form.get("starting_ease", 250)) / 100.0
        srs.easy_bonus = float(request.form.get("easy_bonus", 130)) / 100.0
        srs.interval_modifier = (
            float(request.form.get("interval_modifier", 100)) / 100.0
        )
        srs.hard_interval_multiplier = (
            float(request.form.get("hard_interval_multiplier", 120)) / 100.0
        )

        # Basic validation (ensure positive numbers where needed)
        if srs.new_cards_per_day < 0:
            srs.new_cards_per_day = 0
        if srs.max_reviews_per_day < 0:
            srs.max_reviews_per_day = 0
        if srs.graduating_interval < 1:
            srs.graduating_interval = 1
        if srs.easy_interval < 1:
            srs.easy_interval = 1
        if srs.starting_ease < 1.3:
            srs.starting_ease = 1.3  # Min ease 130%
        if srs.easy_bonus < 1.0:
            srs.easy_bonus = 1.0
        if srs.interval_modifier < 0.1:
            srs.interval_modifier = 0.1
        if srs.hard_interval_multiplier < 1.0:
            srs.hard_interval_multiplier = 1.0
        # TODO: Add validation for learning_steps format (numbers separated by space)

        db.session.commit()
        flash(f"Review settings updated for {language.name}.", "success")
    except ValueError as e:
        db.session.rollback()
        flash(f"Invalid input value for review settings: {e}", "error")
    except Exception as e:
        db.session.rollback()
        flash(f"An error occurred saving review settings: {e}", "error")
        app.logger.error(f"Error updating SRS settings for lang {lang_id}: {e}")

    return redirect(url_for("settings"))


# --- End Update SRS Settings Route ---


# --- Database Backup Route ---
@app.route("/backup/database")
def backup_database():
    try:
        db_path = os.path.join(BASE_DIR, "app.db")
        if not os.path.exists(db_path):
            flash("Database file not found.", "error")
            return redirect(url_for("settings"))

        # Generate a filename with timestamp
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"fluentmind_backup_{timestamp}.db"

        return send_file(db_path, as_attachment=True, download_name=filename)

    except Exception as e:
        app.logger.error(f"Error during database backup: {e}")
        flash("An error occurred while creating the database backup.", "error")
        return redirect(url_for("settings"))


# --- End Backup Route ---


# --- AI Story Generation API ---
@app.route("/api/ai/generate_story/<int:lang_id>", methods=["POST"])
def generate_ai_story(lang_id):
    # 1. Check for API Keys
    openai_api_key = os.environ.get("OPENAI_API_KEY")
    elevenlabs_api_key = os.environ.get("ELEVENLABS_API_KEY")
    if not openai_api_key:
        return jsonify(error="OpenAI API key not configured."), 500
    # Note: We check for ElevenLabs key later, only if voice_id is provided

    # 2. Get Language and Request Data
    language = db.session.get(Language, lang_id)
    if not language:
        return jsonify(error="Language not found"), 404

    data = request.get_json()
    theme = data.get("theme")
    voice_id = data.get("voice_id")  # <<< Get voice_id from request
    if not theme:
        return jsonify(error="Theme is required"), 400
    # voice_id is optional for now

    # --- CHECK: Minimum Known Words (Status 4, 5, 6, 7) ---
    MIN_KNOWN_WORDS_FOR_STORY = 200
    known_count = (
        db.session.query(func.count(func.distinct(VocabTerm.lemma)))
        .filter(
            VocabTerm.language_id == lang_id,
            VocabTerm.status.in_([4, 5, 6, 7]),
            VocabTerm.lemma.isnot(None),
        )
        .scalar()
        or 0
    )

    if known_count < MIN_KNOWN_WORDS_FOR_STORY:
        return (
            jsonify(
                error=f"Need at least {MIN_KNOWN_WORDS_FOR_STORY} known words (level 4+) to generate stories. You have {known_count}."
            ),
            403,
        )  # 403 Forbidden
    # --- END CHECK ---

    # 3. Fetch Known Vocabulary (Status 4, 5, 6, or 7)
    known_vocab = (
        db.session.query(VocabTerm.term)
        .filter(
            VocabTerm.language_id == lang_id,
            VocabTerm.status.in_([4, 5, 6, 7]),  # Use specific statuses
        )
        .distinct()
        .all()
    )

    known_words = [row.term for row in known_vocab]
    if not known_words:
        known_words_str = "(No specific words provided, please write a simple story)"
    else:
        known_words_str = ", ".join(known_words)

    # 4. Construct Prompt for Story Text
    # TODO: Refine this prompt for better results and control
    prompt = (
        f"Write a short story for a language learner studying {language.name}. "
        f"The story should be about the theme: '{theme}'. "
        f"Try to naturally incorporate the following words the learner knows: {known_words_str}. "
        f"The story should be suitable for reading practice, relatively simple but engaging. "
        f"Keep the story in {language.name}. Do not include translations or explanations, only the story itself."
    )

    # 5. Call OpenAI API for Story Text
    generated_content = None
    try:
        openai_client = openai.OpenAI(api_key=openai_api_key)
        story_response = openai_client.chat.completions.create(
            model="gpt-4o",  # <<< Changed model to gpt-4o
            messages=[
                {
                    "role": "system",
                    "content": "You are an assistant helping language learners by writing stories.",
                },
                {"role": "user", "content": prompt},
            ],
            max_tokens=500,  # Increased max_tokens slightly for potentially longer stories
        )
        generated_content = story_response.choices[0].message.content.strip()

    except Exception as e:
        app.logger.error(f"OpenAI API error (text generation): {e}")
        return jsonify(error=f"Failed to generate story text from AI: {e}"), 500

    # 6. Save Initial Story to Database (to get an ID)
    new_story = None
    image_filename = None  # No image generation anymore
    try:
        generated_title = f"{language.name} Story: {theme}"
        new_story = Story(
            language_id=lang_id,
            title=generated_title,
            theme=theme,
            content=generated_content,
            cover_image_filename=image_filename,
            audio_filename=None,  # Initialize as None
            grammar_summary=None,  # Initialize as None
            created_at=datetime.utcnow(),
            readability_score=0.0, # New field for readability
        )
        db.session.add(new_story)
        db.session.flush()  # Flush to get the ID without full commit yet
        story_id = new_story.id  # Get the ID for filenames etc.
        app.logger.info(f"Initial story record created with ID: {story_id}")

    except Exception as e:
        db.session.rollback()
        app.logger.error(f"Database error saving initial story record: {e}")
        return jsonify(error="Failed to save initial story record to database."), 500

    # --- 7. Generate TTS Audio with ElevenLabs (if voice_id provided) ---
    generated_audio_filename = None
    if voice_id and generated_content:
        if not elevenlabs_api_key:
            # Commit the story text before returning the error
            db.session.commit()
            app.logger.warning(
                f"Story {story_id} created, but ElevenLabs API key not configured. Skipping TTS."
            )
            # Return success but indicate no audio was generated
            return (
                jsonify(
                    {
                        "id": new_story.id,
                        "title": new_story.title,
                        "theme": new_story.theme,
                        "content": new_story.content,
                        "cover_image_filename": new_story.cover_image_filename,
                        "audio_filename": None,  # Explicitly None
                        "message": "Story created, but TTS skipped (API key missing).",
                        "created_at": (
                            new_story.created_at.isoformat()
                            if new_story.created_at
                            else datetime.utcnow().isoformat()
                        ),
                    }
                ),
                201,
            )  # Still created

        try:
            app.logger.info(
                f"Attempting TTS generation for story {story_id} with voice {voice_id}"
            )
            eleven_client = ElevenLabs(api_key=elevenlabs_api_key)

            audio_iterator = eleven_client.generate(
                text=generated_content,
                voice=voice_id,
                model="eleven_multilingual_v2",  # Or another appropriate model
            )

            # Define save path
            audio_save_folder = os.path.join(app.config["UPLOAD_FOLDER"], "story_audio")
            os.makedirs(audio_save_folder, exist_ok=True)
            timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
            # Include story ID in filename for easier association
            temp_audio_filename = f"story_{story_id}_{timestamp}.mp3"
            audio_save_path = os.path.join(audio_save_folder, temp_audio_filename)

            # Save the audio stream to file
            save(audio_iterator, audio_save_path)
            generated_audio_filename = temp_audio_filename  # Store the filename
            app.logger.info(f"Successfully saved TTS audio to {audio_save_path}")

            # Update the story record with the audio filename
            new_story.audio_filename = generated_audio_filename

        except Exception as e:
            # Log the error but don't fail the whole request
            # The story text is already saved
            db.session.commit()  # Commit the story text even if TTS fails
            app.logger.error(
                f"ElevenLabs API error or file save error for story {story_id}: {e}"
            )
            # Return success but indicate TTS failure
            return (
                jsonify(
                    {
                        "id": new_story.id,
                        "title": new_story.title,
                        "theme": new_story.theme,
                        "content": new_story.content,
                        "cover_image_filename": new_story.cover_image_filename,
                        "audio_filename": None,  # Explicitly None
                        "error": f"Story created, but failed to generate TTS audio: {e}",
                        "created_at": (
                            new_story.created_at.isoformat()
                            if new_story.created_at
                            else datetime.utcnow().isoformat()
                        ),
                    }
                ),
                201,
            )  # Still created, but with error info

    # --- 8. Final Commit and Return Response ---
    try:
        db.session.commit()  # Commit final changes (including audio_filename if successful)
        app.logger.info(
            f"Story {story_id} fully saved (Audio: {generated_audio_filename})"
        )
    except Exception as e:
        db.session.rollback()
        app.logger.error(
            f"Database error during final commit for story {story_id}: {e}"
        )
        # If the final commit fails, we might have an orphan audio file
        # TODO: Add cleanup logic for orphan audio files if commit fails here
        return (
            jsonify(error="Failed to save story details to database after processing."),
            500,
        )

    return (
        jsonify(
            {
                "id": new_story.id,
                "title": new_story.title,
                "theme": new_story.theme,
                "content": new_story.content,
                "cover_image_filename": new_story.cover_image_filename,
                "audio_filename": new_story.audio_filename,  # Return the actual filename (or None)
                "created_at": (
                    new_story.created_at.isoformat()
                    if new_story.created_at
                    else datetime.utcnow().isoformat()
                ),
            }
        ),
        201,
    )  # 201 Created status


# --- End AI Story Generation API ---


# --- Story Audio Download Route ---
@app.route("/download_story_audio/<int:story_id>")
def download_story_audio(story_id):
    story = db.session.get(Story, story_id)
    if not story or not story.audio_filename:
        flash("Audio file not found for this story.", "error")
        # Redirect back to the story reader or language page if possible
        # For simplicity, redirect to dashboard for now
        return redirect(url_for("dashboard"))

    try:
        audio_folder = os.path.join(app.config["UPLOAD_FOLDER"], "story_audio")
        file_path = os.path.join(audio_folder, story.audio_filename)

        if not os.path.exists(file_path):
            flash("Audio file is missing from storage.", "error")
            app.logger.error(f"Missing audio file for story {story_id}: {file_path}")
            return redirect(url_for("dashboard"))

        # Generate a user-friendly download name (e.g., Story_Title.mp3)
        safe_title = "".join(
            c for c in story.title if c.isalnum() or c in (" ", "-")
        ).rstrip()
        download_name = f"{safe_title}.mp3"

        return send_file(file_path, as_attachment=True, download_name=download_name)

    except Exception as e:
        app.logger.error(f"Error during story audio download for story {story_id}: {e}")
        flash("An error occurred while downloading the audio file.", "error")
        return redirect(url_for("dashboard"))


# --- End Story Audio Download Route ---


# --- API Endpoint for Grammar Summary ---
@app.route("/api/grammar_summary/<string:item_type>/<int:item_id>", methods=["GET"])
def get_grammar_summary(item_type, item_id):
    # 1. Validate item_type and fetch item
    item = None
    text_content = None
    language = None
    if item_type == "lesson":
        item = db.session.get(Lesson, item_id)
        if item:
            text_content = item.text_content
            language = item.language  # Access language via relationship
    elif item_type == "story":
        item = db.session.get(Story, item_id)
        if item:
            text_content = item.content
            language = item.language
    else:
        return (
            jsonify(error="Invalid item type specified (must be 'lesson' or 'story')"),
            400,
        )

    if not item:
        return jsonify(error=f"{item_type.capitalize()} not found"), 404
    if not language:
        # Should not happen if item exists, but check anyway
        app.logger.error(f"Language relationship missing for {item_type} {item_id}")
        return jsonify(error="Could not determine language for the item."), 500

    # 2. Check if summary already exists
    if item.grammar_summary:
        app.logger.info(f"Returning existing grammar summary for {item_type} {item_id}")
        return jsonify(summary=item.grammar_summary)

    # 3. Generate summary if not exists
    app.logger.info(f"Generating new grammar summary for {item_type} {item_id}")
    openai_api_key = os.environ.get("OPENAI_API_KEY")
    if not openai_api_key:
        return jsonify(error="OpenAI API key not configured."), 500

    cefr_level = language.level or "intermediate"  # Default level if not set
    lang_name = language.name

    # Construct the prompt
    prompt = (
        f"You are an expert language tutor. Analyze the following {lang_name} text "
        f"for a language learner whose approximate CEFR level is {cefr_level}. "
        f"Identify the 3-5 most important grammatical structures, patterns, or concepts demonstrated within this text "
        f"that are relevant and useful for a learner at the {cefr_level} level to focus on. "
        f"Exclude very basic concepts unless the level is A1/A2. "
        f"For each concept identified:"
        f"1. Provide a concise explanation (1-2 sentences) of the grammar point in simple English."
        f"2. Provide 1-2 clear example sentences *taken directly from the text* that illustrate the point. Bold the key part of the example."
        f"Structure the output using Markdown with clear headings for each grammar point."
        f"\n---\nText to Analyze:\n{text_content}"
    )

    try:
        openai_client = openai.OpenAI(api_key=openai_api_key)
        summary_response = openai_client.chat.completions.create(
            model="gpt-4o",  # Using GPT-4o as requested
            messages=[
                {
                    "role": "system",
                    "content": "You generate helpful, level-appropriate grammar summaries from text.",
                },
                {"role": "user", "content": prompt},
            ],
            # max_tokens=500 # Adjust token limit if needed
        )
        generated_summary = summary_response.choices[0].message.content.strip()

        # Save the generated summary to the database
        item.grammar_summary = generated_summary
        db.session.commit()
        app.logger.info(
            f"Successfully generated and saved grammar summary for {item_type} {item_id}"
        )

        return jsonify(summary=generated_summary)

    except Exception as e:
        db.session.rollback()  # Rollback potential failed commit
        app.logger.error(
            f"Error generating or saving grammar summary for {item_type} {item_id}: {e}"
        )
        return jsonify(error=f"Failed to generate grammar summary from AI: {e}"), 500


# --- End Grammar Summary API ---


# --- NEW Route for Reading Stories ---
@app.route("/read_story/<int:story_id>")
def read_story(story_id):
    story = db.session.get(Story, story_id)
    if not story:
        flash("Story not found.", "error")
        return redirect(url_for("dashboard"))  # Or perhaps back to the language page?

    # Pass the story object and its language to the template
    return render_template("story_reader.html", story=story, language=story.language)


# --- End Story Reader Route ---

# --- CEFR Progress and Text Analysis API ---

@app.route('/api/cefr-progress/<int:language_id>', methods=['GET'])
def get_cefr_progress_api(language_id):
    """
    API endpoint to get CEFR progress data for a language.
    
    Returns:
        JSON with CEFR progress information
    """
    try:
        # Import inside function to avoid circular imports
        from vocab_utils import get_cefr_progress
        
        # Ensure the language exists
        language = db.session.get(Language, language_id)
        if not language:
            return jsonify({
                'success': False,
                'error': 'Language not found'
            }), 404
            
        # Directly compute CEFR progress without updating levels on each request
        progress = get_cefr_progress(language_id)
        
        # Return the progress data directly, not wrapped in a 'data' key
        return jsonify(progress)
    except Exception as e:
        import traceback
        print(f"Error in get_cefr_progress_api: {str(e)}")
        print(traceback.format_exc())
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/analyze-text', methods=['POST'])
def analyze_text():
    """
    API endpoint to analyze text and return vocabulary statistics.
    
    Expected JSON payload:
    {
        'text': 'The text to analyze',
        'language_id': 1
    }
    
    Returns:
        JSON with vocabulary analysis
    """
    data = request.get_json()
    
    if not data or 'text' not in data or 'language_id' not in data:
        return jsonify({
            'success': False,
            'error': 'Missing required fields: text and language_id are required'
        }), 400
    
    try:
        from .vocab_utils import process_text_for_vocab
        analysis = process_text_for_vocab(data['text'], data['language_id'])
        return jsonify({
            'success': True,
            'data': analysis
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

# --- End CEFR Progress and Text Analysis API ---

# --- spaCy Model Cache ---
# Moved to extensions.py
# --- End spaCy Helper ---


# --- API Endpoint for Lesson Timestamps ---
@app.route("/api/lesson_timestamps/<int:lesson_id>")
def get_lesson_timestamps(lesson_id):
    lesson = Lesson.query.get(lesson_id)
    if not lesson:
        return jsonify(error="Lesson not found"), 404

    # Timestamps are stored as a JSON string, so we return it directly
    # If timestamps is None, return an empty array or null, as expected by frontend
    timestamps_data = json.loads(lesson.timestamps) if lesson.timestamps else []
    return jsonify(timestamps=timestamps_data)


@app.route("/fix-lesson-media")
def fix_lesson_media_url():
    from app import db, Lesson
    import os
    from flask import url_for

    lesson = db.session.get(Lesson, 3)

    if lesson and lesson.media_url:
        fixed_url = lesson.media_url.replace("\\", "/").replace("%5C", "/")

        if fixed_url.startswith("/static/"):
            relative_path = fixed_url[len("/static/") :]
            lesson.media_url = url_for("static", filename=relative_path)
        else:
            lesson.media_url = fixed_url

        db.session.commit()
        return (
            "Media URL fixed for Lesson 3. You can now remove this route from app.py."
        )
    else:
        return "No media URL to update for Lesson 3 or lesson not found."


@app.route("/lesson/<int:lesson_id>/update_offset", methods=["POST"])
def update_timestamp_offset(lesson_id):
    lesson = db.session.get(Lesson, lesson_id)
    if not lesson:
        return jsonify({"success": False, "error": "Lesson not found"}), 404

    try:
        data = request.get_json()
        offset = float(data.get("offset", 0))
        lesson.timestamp_offset = offset
        db.session.commit()
        return jsonify({"success": True})
    except Exception as e:
        db.session.rollback()
        return jsonify({"success": False, "error": str(e)}), 400


@app.route("/lesson/<int:lesson_id>/get_offset", methods=["GET"])
def get_timestamp_offset(lesson_id):
    lesson = db.session.get(Lesson, lesson_id)
    if not lesson:
        return jsonify({"success": False, "error": "Lesson not found"}), 404

    return jsonify({"success": True, "offset": lesson.timestamp_offset})


def download_spacy_model_async(model_name):
    """
    Download a spaCy model asynchronously.
    
    Args:
        model_name (str): Name of the spaCy model to download (e.g., 'en_core_web_sm')
        
    Returns:
        bool: True if the model was successfully downloaded, False otherwise
    """
    try:
        # First, try to load the model to check if it's already installed
        try:
            spacy.load(model_name)
            logging.info(f"SpaCy model '{model_name}' is already installed.")
            return True
        except OSError:
            logging.info(f"SpaCy model '{model_name}' not found locally. Attempting download...")
        
        # Try different methods to download the model
        methods = [
            # Method 1: Try with python -m pip
            lambda: subprocess.run(
                [sys.executable, "-m", "pip", "install", f"{model_name}"],
                capture_output=True, text=True, check=True
            ),
            # Method 2: Try with python -m spacy download
            lambda: subprocess.run(
                [sys.executable, "-m", "spacy", "download", model_name],
                capture_output=True, text=True, check=True
            ),
            # Method 3: Try with pip directly (as a fallback)
            lambda: subprocess.run(
                ["pip", "install", f"{model_name}"],
                capture_output=True, text=True, check=True
            )
        ]
        
        last_error = None
        
        for method in methods:
            try:
                result = method()
                # Verify the model was installed by trying to load it
                try:
                    spacy.load(model_name)
                    logging.info(f"SpaCy model '{model_name}' downloaded and verified successfully.")
                    logging.debug(f"Download output: {result.stdout}")
                    return True
                except OSError as e:
                    logging.error(f"Model '{model_name}' failed to load after installation: {e}")
                    last_error = e
            except subprocess.CalledProcessError as e:
                logging.warning(f"Download attempt failed: {e.stderr}")
                last_error = e
                continue
        
        # If we get here, all methods failed
        error_msg = f"All download methods failed for model '{model_name}'. Last error: {str(last_error)}"
        logging.error(error_msg)
        return False
        
    except Exception as e:
        error_msg = f"An unexpected error occurred during SpaCy model download: {str(e)}"
        logging.error(error_msg)
        return False


def download_and_update_status(language_id, model_name):
    with app.app_context():  # Essential for database operations in a new thread
        language = Language.query.get(language_id)
        if language:
            success = download_spacy_model_async(model_name)
            if success:
                language.spacy_model_status = "available"
                logging.info(
                    f"Model for {language.name} successfully downloaded and status updated."
                )
            else:
                language.spacy_model_status = "failed"
                logging.error(f"Model download for {language.name} failed.")
            db.session.commit()


@app.route("/backfill_vocab_created_at")
def backfill_vocab_created_at():
    try:
        vocab_terms_to_update = VocabTerm.query.filter(VocabTerm.created_at.is_(None)).all()
        for term in vocab_terms_to_update:
            # Use last_review_date if available, otherwise a default old date
            term.created_at = term.last_review_date if term.last_review_date else datetime(2000, 1, 1)
            db.session.add(term)
        db.session.commit()
        flash("Successfully backfilled created_at dates for vocabulary terms!", "success")
    except Exception as e:
        db.session.rollback()
        flash(f"Error backfilling vocabulary created_at dates: {e}", "error")
        current_app.logger.error(f"Error backfilling vocab created_at: {e}")
    return redirect(url_for("stats"))


@app.route("/backfill_vocab_reviews_data")
def backfill_vocab_reviews_data():
    try:
        # Find terms that are known (status 6) but have no last_review_date
        vocab_terms_to_update = VocabTerm.query.filter(
            VocabTerm.status == 6,  # STATUS_KNOWN
            VocabTerm.last_review_date.is_(None)
        ).all()

        for term in vocab_terms_to_update:
            # Use created_at as a fallback for last_review_date if available
            # Otherwise, use a very old default date to ensure it appears in "all time" views
            term.last_review_date = term.created_at if term.created_at else datetime(2000, 1, 1)
            term.last_rating_type = "good"  # Assume 'good' for historical known words
            db.session.add(term)

        db.session.commit()
        flash("Successfully backfilled review data for known vocabulary terms!", "success")
    except Exception as e:
        db.session.rollback()
        flash(f"Error backfilling review data: {e}", "error")
        current_app.logger.error(f"Error backfilling vocab review data: {e}")
    return redirect(url_for("stats"))


@app.route("/backfill_readability_scores")
def backfill_readability_scores():
    from vocab_utils import compute_readability, get_words_for_readability
    # Use the model registry to avoid circular import
    Lesson = db.Model.registry._class_registry.get("Lesson")
    Story = db.Model.registry._class_registry.get("Story")

    updated_lessons_count = 0
    updated_stories_count = 0

    try:
        lessons = Lesson.query.all()
        for lesson in lessons:
            if lesson.text_content:
                words_data = get_words_for_readability(lesson.text_content, lesson.language_id)
                lesson.readability_score = compute_readability(words_data)
                db.session.add(lesson)
                updated_lessons_count += 1

        stories = Story.query.all()
        for story in stories:
            if story.content:
                words_data = get_words_for_readability(story.content, story.language_id)
                story.readability_score = compute_readability(words_data)
                db.session.add(story)
                updated_stories_count += 1

        db.session.commit()
        flash(f"Successfully backfilled readability scores for {updated_lessons_count} lessons and {updated_stories_count} stories!", "success")

    except Exception as e:
        db.session.rollback()
        flash(f"Error backfilling readability scores: {e}", "error")
        current_app.logger.error(f"Error backfilling readability scores: {e}")

    return redirect(url_for("dashboard"))


if __name__ == "__main__":
    with app.app_context():
        db.create_all()  # Create tables if they don't exist
    app.run(debug=True, host="0.0.0.0", port=5000)
