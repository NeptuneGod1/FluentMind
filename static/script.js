// Define word status constants
const STATUS_UNKNOWN = 0; // Blue Highlight
const STATUS_LEVEL_1 = 1; // Red
const STATUS_LEVEL_2 = 2; // Orange
const STATUS_LEVEL_3 = 3; // Yellow
const STATUS_LEVEL_4 = 4; // Light Green
const STATUS_LEVEL_5 = 5; // Green
const STATUS_KNOWN = 6; // Known (no highlight)
const STATUS_IGNORED = 7; // Changed from 99 to 7 for consistency

// Map statuses to CSS classes for styling
const statusClasses = {
    [STATUS_UNKNOWN]: 'word-unknown',
    [STATUS_LEVEL_1]: 'word-level-1',
    [STATUS_LEVEL_2]: 'word-level-2',
    [STATUS_LEVEL_3]: 'word-level-3',
    [STATUS_LEVEL_4]: 'word-level-4',
    [STATUS_LEVEL_5]: 'word-level-5',
    [STATUS_KNOWN]: 'word-known',
    [STATUS_IGNORED]: 'word-ignored',
};

// --- Global Variables ---
let currentLanguageId = null;
let currentLessonId = null; // Re-add this global declaration
let vocabCache = {}; // Simple cache for word statuses
let currentEditorTerm = null; // Store term currently in editor
let multiwordTermsCache = []; // Cache for known multi-word terms
let definitionTooltip = null; // Global variable for the tooltip element

// --- Pagination Variables ---
let currentPage = 1;
let totalPages = 1;
let pagedElements = []; // Stores the actual elements for each page
let allParsedElements = []; // NEW: Stores the original, full parsed text elements
let pageInfo = []; // NEW: Stores { firstGlobalParagraphIndex: X } for each page
const ELEMENTS_PER_PAGE = 300; // Adjust this number as needed

// --- Media Player Sync Variables ---
let timestamps = null;
let syncInterval = null; // Interval for updating current segment
let html5Player = null; // Global variable for HTML5 player (video or audio)
let playerActive = false; // Flag to indicate if any player is actively syncing

// --- Repeat Functionality Variables ---
let repeatLoopInterval = null;
let currentRepeatMode = null; // 'page', 'sentence', or null
let repeatLoopStartTime = 0;
let repeatLoopEndTime = 0;
let isRepeatModeActive = false;
let isAutoscrollEnabled = true; // User-toggleable autoscroll state

// --- Timestamp Offset Variable ---
let timestampOffset = 0; // Global offset in seconds for all timestamps
console.log("Global timestampOffset initialized to:", timestampOffset);

// --- Flashcard Review Variables ---
let reviewCards = [];
let currentCardIndex = 0;
let cardHistory = [];

// Add this at the top of the file, after other global variables
let lastUserScrollTime = 0;
const USER_SCROLL_TIMEOUT = 2000; // 2 seconds
let isVideoPlaying = false;

// Add these at the top with other global variables
let repeatPageStartTime = null;
let repeatPageEndTime = null;

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    console.log("DOMContentLoaded event fired.");

    const reviewArea = document.getElementById('review-area');
    const appContainer = document.querySelector('.app-container');

    if (appContainer) {
        console.log("Initializing Reader-specific features.");
        initializeReader();
        initializePageRange();

        // --- Autoscroll Toggle ---
        const autoscrollBtn = document.getElementById('autoscroll-toggle-btn');
        if (autoscrollBtn) {
            // Set initial state visual to match the new 'on' state styling
            autoscrollBtn.classList.toggle('autoscroll-on', isAutoscrollEnabled);

            autoscrollBtn.addEventListener('click', () => {
                isAutoscrollEnabled = !isAutoscrollEnabled;
                autoscrollBtn.classList.toggle('autoscroll-on', isAutoscrollEnabled);
                console.log(`Autoscroll toggled: ${isAutoscrollEnabled}`);

                // If autoscroll is turned off, immediately remove any active highlighting
                if (!isAutoscrollEnabled) {
                    document.querySelectorAll('.lesson-paragraph.current-segment').forEach(p => {
                        p.classList.remove('current-segment');
                    });
                }
            });
        }
        initializeEditorButtons();
        createTooltipElement();
        initializeRepeatControls();
        initializeTimestampAdjustment();
    } else if (reviewArea) {
        console.log("Initializing Flashcard Review features.");
        currentLanguageId = reviewArea.dataset.languageId; // Set currentLanguageId from data attribute
        console.log("currentLanguageId after reviewArea assignment:", currentLanguageId); // Add this line
        loadReviewCards();
        // Attach flashcard event listeners
        document.getElementById('show-answer').addEventListener('click', showAnswer);
        document.getElementById('go-back-btn').addEventListener('click', goBackToLastCard); // Attach event listener to Go Back button
        document.querySelectorAll('[data-rating]').forEach(button => {
            button.addEventListener('click', function() {
                rateCard(this.dataset.rating);
            });
        });
    } else {
        console.log("No specific application area (reader or review) found to initialize.");
    }
});

function initializeReader() {
    console.log("Initializing Reader: START");
    const textContainer = document.getElementById('text-container');
    if (!textContainer) {
        console.error("Reader Error: Text container not found");
        return;
    }

    // Add scroll event listener to detect user scrolling
    const parsedTextArea = document.getElementById('parsed-text-area');
    if (parsedTextArea) {
        parsedTextArea.addEventListener('scroll', () => {
            lastUserScrollTime = Date.now();
        });
    }

    // Get language and lesson IDs from data attributes FIRST
    const appContainer = document.querySelector('.app-container');
    if (!appContainer) {
        console.error("Reader Error: App container not found");
        return;
    }
    currentLanguageId = appContainer.dataset.languageId; // Assign to global variable
    currentLessonId = appContainer.dataset.lessonId; // Assign lesson ID to global variable

    console.log("currentLessonId after assignment:", currentLessonId);
    console.log("timestampOffset at start of initializeReader:", timestampOffset);

    if (!currentLanguageId) {
        console.error("Reader Error: Language ID not found in app container");
        return;
    }
    if (!currentLessonId) {
        console.error("Reader Error: Lesson ID not found in app container");
        return;
    }

    // Get raw text from data attribute
    const rawText = textContainer.dataset.rawText;
    if (!rawText) {
        console.error("Reader Error: Raw text not found in text container");
        return;
    }

    // Parse text into elements
    const allParsedElements = parseText(rawText);
    console.log("Parsed elements:", allParsedElements);

    // Extract unique single-word terms for vocabulary lookup
    const uniqueSingleTerms = [...new Set(allParsedElements
        .filter(el => el.type === 'word')
        .map(el => el.term.toLowerCase()))];
    console.log("Unique single terms:", uniqueSingleTerms);

    // Fetch vocabulary status and multiword terms in parallel
    Promise.all([
            fetchVocabStatus(currentLanguageId, uniqueSingleTerms),
            fetchMultiwordTerms(currentLanguageId)
        ])
        .then(([singleWordVocab, multiwordTerms]) => {
            vocabCache = singleWordVocab;
            multiwordTermsCache = multiwordTerms;
            console.log("Vocab status and multiword terms fetched.");

            // Load timestamps first
            const timestampsScriptTag = document.getElementById('timestamps-data');
            if (timestampsScriptTag) {
                const timestampsJson = timestampsScriptTag.textContent;
                if (timestampsJson && timestampsJson.trim() !== '' && timestampsJson.trim().toLowerCase() !== 'null') {
                    try {
                        timestamps = JSON.parse(timestampsJson);
                        console.log("Timestamps loaded successfully:", timestamps);
                    } catch (e) {
                        console.error("Error parsing timestamps JSON:", e);
                        timestamps = null;
                    }
                }
            }

            // Initialize media player if timestamps exist
            if (timestamps && Array.isArray(timestamps) && timestamps.length > 0) {
                const youtubeContainer = document.getElementById('video-player-container');
                const html5MediaElement = document.getElementById('html5-player');

                if (youtubeContainer && youtubeContainer.dataset.youtubeUrl) {
                    console.log("Initializing YouTube video sync...");
                    initializeVideoSync();
                } else if (html5MediaElement && html5MediaElement.src) {
                    console.log("Initializing HTML5 player sync...");
                    initializeHtml5PlayerSync();
                } else {
                    console.log("No supported media player found with timestamps available, skipping media sync initialization.");
                }
            } else {
                console.log("No timestamps available, skipping media sync initialization.");
            }

            // Setup pagination
            const needsPagination = allParsedElements.length > ELEMENTS_PER_PAGE;
            if (needsPagination) {
                console.log("Setting up pagination.");
                setupPagination(allParsedElements);
            } else {
                console.log("No pagination needed.");
                pagedElements = [allParsedElements];
                pageInfo = [{
                    firstGlobalParagraphIndex: 0
                }];
                totalPages = 1;
            }

            // Initial render
            console.log("Rendering initial page.", currentPage);
            renderPage(currentPage);
            console.log("initializeReader main promise chain complete.");
        })
        .catch(error => {
            console.error("Error during main initialization promise chain:", error);
            const parsedTextArea = document.getElementById('parsed-text-area');
            if (parsedTextArea) {
                parsedTextArea.innerHTML = '<p class="text-danger">Error loading content. Please try refreshing the page.</p>';
            }
        });

    console.log("About to fetch timestamp offset for lesson:", currentLessonId);
    // Get the initial timestamp offset from the server
    fetch(`/lesson/${currentLessonId}/get_offset`)
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            if (data.success && data.offset !== undefined && data.offset !== null) { // Add null check
                timestampOffset = parseFloat(data.offset);
                console.log("Loaded timestamp offset:", timestampOffset);
            } else {
                console.error("Failed to load offset from server or offset is invalid:", data.error || data.offset);
                timestampOffset = 0; // Reset to 0 if loading fails
            }
        })
        .catch(error => {
            console.error("Error loading timestamp offset fetch:", error);
        });
    console.log("Initializing Reader: END");
}

// --- Text Parsing (Revised) ---
function parseText(text) {
    const elements = [];
    // Regex to find sequences of word characters (Unicode letters/numbers/_) 
    // OR sequences of non-word characters (anything else)
    // The 'u' flag enables Unicode property escapes like \p{L}
    const regex = /([\p{L}\p{N}_]+)|([^\p{L}\p{N}_]+)/gu;
    let match;

    while ((match = regex.exec(text)) !== null) {
        if (match[1]) { // Group 1 matched: Word characters
            elements.push({
                type: 'word',
                term: match[1]
            });
        } else if (match[2]) { // Group 2 matched: Non-word characters (separators)
            elements.push({
                type: 'separator',
                text: match[2]
            });
        }
    }
    // console.log("Parsed Elements:", elements); // Add for debugging if needed
    return elements;
}

// --- Fetch Vocab Status from API ---
async function fetchVocabStatus(langId, termsList) {
    console.log("Fetching status for terms:", termsList);
    const response = await fetch(`/api/vocab/${langId}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            terms: termsList
        }),
    });
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    console.log("Received vocab data:", data.vocab);
    return data.vocab; // Returns a dictionary like { 'term': {status: N, translation: '...'} }
}

// --- Fetch Multi-word Terms from API ---
async function fetchMultiwordTerms(langId) {
    console.log("Fetching multi-word terms...");
    const response = await fetch(`/api/multiword-terms/${langId}`);
    if (!response.ok) {
        throw new Error(`HTTP error fetching multi-word terms! status: ${response.status}`);
    }
    const data = await response.json();
    console.log("Received multi-word terms:", data.multiword_terms);
    // Sort by length descending IN PLACE if not already sorted by API
    data.multiword_terms.sort((a, b) => b.term.length - a.term.length);
    return data.multiword_terms || []; // Returns array like [{term: "...", status: N, translation: "..."}]
}

// --- Helper to render paragraphs with timestamps ---
function buildStyledHtmlWithTimestamps(parsedElements, singleWordVocab, multiwordTerms, timestamps, globalParagraphOffset = 0) {
    let html = '';
    let currentParagraph = [];
    let paragraphIndexInPage = 0; // This now tracks index *within the current page's parsedElements*

    // Group elements into paragraphs
    for (let i = 0; i < parsedElements.length; i++) {
        const el = parsedElements[i];
        currentParagraph.push(el);

        // Check if this is the end of a paragraph
        if (el.type === 'separator' && el.text.includes('\n')) {
            // Find matching timestamp for this paragraph using the global offset
            const globalTimestampIndex = globalParagraphOffset + paragraphIndexInPage;
            const timestamp = timestamps && timestamps[globalTimestampIndex];

            // Start new paragraph
            html += '<p class="lesson-paragraph"';
            if (timestamp) {
                html += ` data-timestamp="${timestamp.timestamp}"`;
            }
            html += '>';

            // Add timestamp badge if available
            if (timestamp) {
                const minutes = Math.floor(timestamp.timestamp / 60);
                const seconds = timestamp.timestamp % 60;
                const timeStr = minutes > 0 ?
                    `${minutes}:${seconds.toString().padStart(2, '0')}` :
                    `${seconds}s`;
                html += `<span class="timestamp-badge" data-timestamp="${timestamp.timestamp}">${timeStr}</span> `;
            }

            // Add the paragraph content
            html += buildStyledParagraphHtml(currentParagraph, singleWordVocab, multiwordTerms);
            html += '</p>';

            // Reset for next paragraph
            currentParagraph = [];
            paragraphIndexInPage++;
        }
    }

    // Handle any remaining elements (last paragraph on the page)
    if (currentParagraph.length > 0) {
        const globalTimestampIndex = globalParagraphOffset + paragraphIndexInPage;
        const timestamp = timestamps && timestamps[globalTimestampIndex];
        html += '<p class="lesson-paragraph"';
        if (timestamp) {
            html += ` data-timestamp="${timestamp.timestamp}"`;
        }
        html += '>';

        if (timestamp) {
            const minutes = Math.floor(timestamp.timestamp / 60);
            const seconds = timestamp.timestamp % 60;
            const timeStr = minutes > 0 ?
                `${minutes}:${seconds.toString().padStart(2, '0')}` :
                `${seconds}s`;
            html += `<span class="timestamp-badge" data-timestamp="${timestamp.timestamp}">${timeStr}</span> `;
        }

        html += buildStyledParagraphHtml(currentParagraph, singleWordVocab, multiwordTerms);
        html += '</p>';
    }

    return html;
}

// --- Build HTML without timestamps ---
function buildStyledHtml(elements, singleWordVocab, multiwordTerms) {
    // Group elements into paragraphs
    const paragraphs = [];
    let currentParagraph = [];
    
    for (const element of elements) {
        currentParagraph.push(element);
        
        // Check if this is the end of a paragraph (newline in separator)
        if (element.type === 'separator' && element.text && element.text.includes('\n')) {
            paragraphs.push(currentParagraph);
            currentParagraph = [];
        }
    }
    
    // Add the last paragraph if not empty
    if (currentParagraph.length > 0) {
        paragraphs.push(currentParagraph);
    }
    
    // Build HTML for each paragraph
    let html = '';
    for (const para of paragraphs) {
        html += `<p class="lesson-paragraph">`;
        html += buildStyledParagraphHtml(para, singleWordVocab, multiwordTerms);
        html += `</p>`;
    }
    
    return html;
}

// --- Build HTML for a single paragraph with styling ---
function buildStyledParagraphHtml(elements, singleWordVocab, multiwordTerms) {
    let html = '';
    let i = 0;
    while (i < elements.length) {
        const currentElement = elements[i];
        let multiwordMatch = null;

        if (currentElement.type === 'word') {
            for (const mwTermData of multiwordTerms) {
                const mwTerm = mwTermData.term;
                const mwTermLower = mwTerm.toLowerCase();

                let candidateElements = [];
                let candidateRawText = '';

                let tempIndex = i;
                while (tempIndex < elements.length) {
                    const elem = elements[tempIndex];
                    const elemText = elem.text || elem.term;

                    candidateElements.push(elem);
                    candidateRawText += elemText;

                    const normalizedCandidateText = candidateRawText.replace(/\s+/g, ' ').trim().toLowerCase();

                    if (normalizedCandidateText === mwTermLower) {
                        multiwordMatch = {
                            termData: mwTermData,
                            elements: candidateElements,
                            length: candidateElements.length
                        };
                        break; // Found a match for this mwTermData, break from building this candidate
                    }

                    tempIndex++;
                }

                if (multiwordMatch) {
                    break; // Found the longest match for this position (due to mwTerm sorting), so stop checking other multi-word terms
                }
            }
        }

        // After checking all multi-word terms (or if current element is not a word)
        if (multiwordMatch) {
            const termData = multiwordMatch.termData;
            const statusClass = getStatusClass(termData.status);
            const combinedText = multiwordMatch.elements.map(el => el.text || el.term).join('');
            const translation = termData.translation || '';
            html += `<span class="word ${statusClass}" data-term="${escapeHtml(termData.term)}" data-status="${termData.status}" data-translation="${escapeHtml(translation)}">${escapeHtml(combinedText)}</span>`;
            i += multiwordMatch.length; // Advance index past the consumed elements
        } else if (currentElement.type === 'word') {
            // Process as a single word if no multi-word match found
            const lowerTerm = currentElement.term.toLowerCase();
            const statusInfo = singleWordVocab[lowerTerm] || {
                status: 0,
                translation: null
            };
            const statusClass = getStatusClass(statusInfo.status);
            const translation = statusInfo.translation || '';
            html += `<span class="word ${statusClass}" data-term="${escapeHtml(currentElement.term)}" data-status="${statusInfo.status}" data-translation="${escapeHtml(translation)}">${escapeHtml(currentElement.term)}</span>`;
            i++;
        } else if (currentElement.type === 'separator') {
            html += `<span>${escapeHtml(currentElement.text)}</span>`;
            i++;
        }
    }
    return html;
}

// --- Get CSS Class from Status Number ---
function getStatusClass(status) {
    status = parseInt(status, 10);
    if (status >= 1 && status <= 5) return `word-level-${status}`;
    if (status === 6) return 'word-known'; // Assuming 6 is known
    if (status === 7) return 'word-ignored'; // Assuming 7 is ignored
    return 'word-unknown'; // Default/status 0
}

// --- Add Click Listeners ---
function addWordClickListeners() {
    const parsedTextArea = document.getElementById('parsed-text-area');
    if (!parsedTextArea) return;

    parsedTextArea.querySelectorAll('.word').forEach(span => {
        span.addEventListener('click', handleWordClick);

        // --- Add Hover Listeners --- 
        span.addEventListener('mouseenter', (event) => {
            const translation = event.target.dataset.translation;
            // --- Add Logging --- 
            console.log('Hovered element:', event.target);
            console.log('Read data-translation:', translation);
            // --- End Logging ---
            if (translation) { // Only show if translation exists
                showTooltip(event.target, translation);
            }
        });
        span.addEventListener('mouseleave', () => {
            hideTooltip();
        });
        // --- End Hover Listeners ---
    });
}

// --- Handle Word Click --- 
function handleWordClick(event) {
    const span = event.currentTarget;
    const term = span.dataset.term;
    const status = span.dataset.status;
    const translation = span.dataset.translation;

    console.log(`Clicked: ${term}, Status: ${status}, Translation: ${translation}`);

    // Remove previous highlighting
    document.querySelectorAll('#parsed-text-area .word.selected').forEach(el => el.classList.remove('selected'));
    // Add highlight to clicked word
    span.classList.add('selected');

    // TODO: Populate Dictionary Pane
    populateDictionaryPane(term);

    // Populate Word Editor Pane
    populateWordEditor(term, status, translation);
}

// --- Populate Dictionary (Placeholder) ---
async function populateDictionaryPane(term) {
    const dictContent = document.getElementById('dict-content');
    dictContent.innerHTML = `<p><i>Looking up "${escapeHtml(term)}"...</i></p>`;

    try {
        const response = await fetch(`/api/dictionaries/${currentLanguageId}`);
        if (!response.ok) throw new Error('Failed to fetch dictionaries');
        const data = await response.json();
        console.log("Received dictionary data:", data); // Add log

        if (data.dictionaries && data.dictionaries.length > 0) {
            // --- Embed the FIRST active dictionary in an iframe ---
            const firstDict = data.dictionaries[0];
            const termUrl = firstDict.url_pattern.replace('###', encodeURIComponent(term));

            console.log(`Embedding dictionary: ${firstDict.name} with URL: ${termUrl}`);

            // Set iframe content
            dictContent.innerHTML = `
                <iframe 
                    id="dict-iframe"
                    src="${termUrl}"
                    style="width: 100%; height: 250px; border: 1px solid #ccc;" 
                    sandbox="allow-scripts allow-same-origin allow-popups allow-forms" 
                    title="Dictionary View - ${escapeHtml(firstDict.name)}"
                ></iframe>
                <p style="font-size: 0.8em; color: #666; margin-top: 5px;">
                    Embedding content from ${escapeHtml(firstDict.name)}. 
                    <a href="${termUrl}" target="_blank">Open in new tab</a>.
                    (May be blocked by dictionary site's policy).
                </p>
            `;
            // // Old link generation logic:
            // let linksHtml = '<ul>';
            // data.dictionaries.forEach(dict => { 
            //     const url = dict.url_pattern.replace('###', encodeURIComponent(term));
            //     linksHtml += `<li><a href="${url}" target="_blank">${escapeHtml(dict.name)}</a></li>`;
            // });
            // linksHtml += '</ul>';
            // dictContent.innerHTML = linksHtml; 
        } else {
            dictContent.innerHTML = '<p><i>No active dictionaries for this language.</i></p>';
        }
    } catch (error) {
        console.error("Error fetching dictionaries:", error);
        dictContent.innerHTML = '<p><i>Error loading dictionary links.</i></p>';
    }
}

// --- Populate Word Editor ---
function populateWordEditor(term, status, translation) {
    currentEditorTerm = term; // Store the term being edited
    document.getElementById('editor-term').textContent = term;
    document.getElementById('editor-status').textContent = getStatusText(status);
    document.getElementById('edit-translation').value = translation || '';

    // Highlight the active status button
    document.querySelectorAll('.status-btn').forEach(btn => {
        btn.classList.remove('active-status');
        if (btn.dataset.status === status) {
            btn.classList.add('active-status');
        }
    });

    // Show editor, hide placeholder
    document.getElementById('editor-content').style.display = 'block';
    document.getElementById('editor-placeholder').style.display = 'none';
}

// --- Get Status Text (Helper) ---
function getStatusText(status) {
    status = parseInt(status, 10);
    if (status === 0) return 'Unknown (0)';
    if (status >= 1 && status <= 5) return `Learning (${status})`;
    if (status === 6) return 'Known (6)';
    if (status === 7) return 'Ignored (7)';
    return 'Invalid Status';
}

// --- Media Player Initialization ---
function initializeMediaPlayer() {
    const playerContainer = document.getElementById('video-player-container');
    if (!playerContainer) {
        console.error("Media player container not found!");
        return;
    }

    const youtubeUrl = playerContainer.dataset.youtubeUrl;
    const audioUrl = playerContainer.dataset.audioUrl; // Assuming you might add this attribute later

    console.log("Initializing media player. YouTube URL:", youtubeUrl, "Audio URL:", audioUrl);

    if (youtubeUrl) {
        // Extract video ID from URL
        const videoId = extractYouTubeId(youtubeUrl);
        console.log("Extracted YouTube Video ID:", videoId);

        if (videoId) {
            // Load the YouTube IFrame API
            const tag = document.createElement('script');
            tag.src = "https://www.youtube.com/iframe_api";
            const firstScriptTag = document.getElementsByTagName('script')[0];
            firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);

            // Create player when API is ready
            window.onYouTubeIframeAPIReady = function() {
                window.player = new YT.Player('video-player-container', {
                    height: '100%',
                    width: '100%',
                    videoId: videoId,
                    playerVars: {
                        'playsinline': 1,
                        'enablejsapi': 1
                    },
                    events: {
                        'onReady': onPlayerReady,
                        'onStateChange': onPlayerStateChange
                    }
                });
            };
        } else {
            playerContainer.innerHTML = '<p><i>Invalid YouTube URL format. Could not extract Video ID.</i></p>';
            console.warn("Could not extract Video ID from URL:", youtubeUrl);
        }
    } else if (audioUrl) {
        playerContainer.innerHTML = `
            <audio controls style="width: 100%;">
                <source src="${audioUrl}" type="audio/mpeg">
                Your browser does not support the audio element.
            </audio>`;
        console.log("Audio player embedded.");
    } else {
        playerContainer.innerHTML = '<p><i>No media provided for this lesson.</i></p>';
        console.log("No valid YouTube or Audio URL found.");
    }
}

function onPlayerReady(event) {
    console.log("YouTube player ready. Player state:", 
               window.player ? getPlayerStateName(window.player.getPlayerState()) : 'N/A');
    
    // Log player methods and properties for debugging
    if (window.player) {
        console.log("Player methods available:", {
            playVideo: typeof window.player.playVideo === 'function',
            pauseVideo: typeof window.player.pauseVideo === 'function',
            getCurrentTime: typeof window.player.getCurrentTime === 'function',
            getDuration: typeof window.player.getDuration === 'function',
            getPlayerState: typeof window.player.getPlayerState === 'function',
            getVideoData: typeof window.player.getVideoData === 'function'
        });
        
        // Log video information
        try {
            const videoData = window.player.getVideoData ? window.player.getVideoData() : null;
            console.log("Video data:", {
                videoId: videoData ? videoData.video_id : 'N/A',
                title: videoData ? videoData.title : 'N/A',
                duration: window.player.getDuration ? window.player.getDuration() : 'N/A'
            });
        } catch (e) {
            console.error("Error getting video data:", e);
        }
    }
    
    // Attach timestamp click listeners
    attachTimestampClickListeners();
    
    // Start video sync if timestamps exist
    if (timestamps && Array.isArray(timestamps) && timestamps.length > 0) {
        console.log("Starting video sync from onPlayerReady");
        startVideoSync();
    } else {
        console.log("No timestamps available, not starting video sync");
    }
}

function onPlayerStateChange(event) {
    if (event.data === YT.PlayerState.PLAYING) {
        isVideoPlaying = true;
        // Only start video sync if not in repeat mode
        if (!isRepeatModeActive) {
            startVideoSync();
        }
    } else if (event.data === YT.PlayerState.PAUSED || event.data === YT.PlayerState.ENDED) {
        isVideoPlaying = false;
        // Only stop video sync if not in repeat mode
        if (!isRepeatModeActive) {
            stopVideoSync();
        }
    }
}

// --- Helper to Extract YouTube ID ---
function extractYouTubeId(url) {
    if (!url || typeof url !== 'string') return null; // Add check for non-string input
    // Regex to handle various YouTube URL formats
    const regex = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?v=|embed\/|v\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/; // Basic 11-char ID
    const match = url.match(regex);
    return match ? match[1] : null;
}

// --- HTML Escaping Helper ---
function escapeHtml(unsafe) {
    if (unsafe === null || typeof unsafe === 'undefined') return '';
    return unsafe
        .toString()
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// --- Utility function for debouncing ---
function debounce(func, delay) {
    let timeoutId;
    return function(...args) {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => func.apply(this, args), delay);
    };
}

// --- Add Listeners for Editor Buttons (Run Once) ---
function initializeEditorButtons() {
    const editor = document.getElementById('word-editor');
    if (!editor) return;

    // Status buttons (use event delegation)
    const statusSelector = editor.querySelector('.status-selector');
    if (statusSelector) {
        statusSelector.addEventListener('click', (event) => {
            if (event.target.classList.contains('status-btn')) {
                const newStatus = event.target.dataset.status;
                if (currentEditorTerm && newStatus !== undefined) {
                    // Remove active class from all status buttons first
                    statusSelector.querySelectorAll('.status-btn').forEach(btn => {
                        btn.classList.remove('active-status');
                    });
                    // Add active class to the clicked button
                    event.target.classList.add('active-status');
                    updateTermDetails(currentEditorTerm, {
                        status: newStatus
                    });
                }
            }
        });
    }

    // Save translation button
    const saveButton = document.getElementById('save-translation');
    if (saveButton) {
        saveButton.addEventListener('click', () => {
            const translation = document.getElementById('edit-translation').value;
            if (currentEditorTerm) {
                // Get current status directly from the displayed text or cache if needed
                // For simplicity, let's refetch status from the span if possible
                const currentStatusSpan = document.querySelector(`#parsed-text-area .word[data-term="${escapeHtml(currentEditorTerm)}"].selected`);
                const currentStatus = currentStatusSpan ? currentStatusSpan.dataset.status : STATUS_UNKNOWN;

                // Use the debounced version here
                debouncedUpdateTermDetails(currentEditorTerm, {
                    translation: translation,
                    // Status only needs to be sent if we are forcing it (e.g. from Unknown to 1)
                    // The backend handles the auto-level-1 logic based on current DB status
                    // Send current status just for backend context if needed for auto-logic.
                    status: currentStatus // (Optional: let backend figure it out)
                });
            }
        });
    }
}

// --- Update Term Status/Translation via API ---
async function updateTermDetails(term, {
    status,
    translation
}) {
    console.log(`Updating term: ${term}, status: ${status}, translation: ${translation}`);
    const dataToSend = {
        term: term,
        lang_id: currentLanguageId, // Make sure currentLanguageId is available globally
        status: status,
        translation: translation,
        lesson_id: currentLessonId // Add lesson_id to the data sent
        // Note: We are no longer sending the 'sentence' from the frontend,
        // as it will be extracted on the backend using SpaCy.
    };
    if (!term || !currentLanguageId) return;

    console.log(`Updating term: ${term}`, {
        status,
        translation
    });

    // --- Find Context Sentence --- 
    let sentence = null;
    const selectedWordSpan = document.querySelector(`#parsed-text-area .word.selected[data-term="${escapeHtml(term)}"]`);
    if (selectedWordSpan) {
        const parentParagraph = selectedWordSpan.closest('.lesson-paragraph');
        if (parentParagraph) {
            const paragraphText = parentParagraph.textContent || parentParagraph.innerText || '';
            const termText = selectedWordSpan.textContent || term;
            const termIndex = paragraphText.indexOf(termText);
            if (termIndex !== -1) {
                // Get a reasonable chunk of text around the term
                const start = Math.max(0, termIndex - 50);
                const end = Math.min(paragraphText.length, termIndex + termText.length + 50);
                sentence = paragraphText.substring(start, end).trim();
            }
        }
    }

    try {
        const response = await fetch('/api/vocab/update', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                term: term,
                lang_id: currentLanguageId,
                status: status,
                translation: translation,
                sentence: sentence
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        if (data.error) {
            throw new Error(data.error);
        }

        // Update the cache with the new data from the server
        const lowerTerm = term.toLowerCase();

        if (term.includes(' ')) { // Heuristic: if it contains a space, it's a multi-word candidate
            let existingMultiwordIndex = multiwordTermsCache.findIndex(t => t.term.toLowerCase() === lowerTerm);

            if (existingMultiwordIndex !== -1) {
                // Update existing multi-word term in cache
                multiwordTermsCache[existingMultiwordIndex].status = data.status || status;
                multiwordTermsCache[existingMultiwordIndex].translation = data.translation || translation;
            } else {
                // Add new multi-word term to cache
                multiwordTermsCache.push({
                    term: term,
                    status: data.status || status,
                    translation: data.translation || translation
                });
            }
            // Re-sort to ensure longer terms are matched first (important for buildStyledParagraphHtml)
            multiwordTermsCache.sort((a, b) => b.term.length - a.term.length);
        } else { // It's a single word
            vocabCache[lowerTerm] = {
                status: data.status || status,
                translation: data.translation || translation
            };
        }

        // Update the selected word's data attributes
        if (selectedWordSpan) {
            selectedWordSpan.dataset.status = data.status || status;
            selectedWordSpan.dataset.translation = data.translation || translation;
            // Update the class to reflect the new status
            selectedWordSpan.className = `word ${getStatusClass(data.status || status)}`;
        }

        // Re-render the current page to reflect changes
        renderPage(currentPage);

        // Re-select the term if it's on the current page
        const newSpan = document.querySelector(`#parsed-text-area .word[data-term="${escapeHtml(term)}"]`);
        if (newSpan) {
            newSpan.classList.add('selected');
        }

    } catch (error) {
        console.error("Error updating term:", error);
        alert(`Failed to update term: ${error.message}`);
    }
}

// Create a debounced version of updateTermDetails
const debouncedUpdateTermDetails = debounce(updateTermDetails, 300); // 300ms delay

// --- NEW: Handle Text Selection --- 
function handleTextSelection(event) {
    const selection = window.getSelection();
    if (!selection.rangeCount) return; // No selection range

    let range = selection.getRangeAt(0);
    let selectedText = range.toString().trim();

    // Ignore empty selections or selections outside the target area
    const textArea = document.getElementById('parsed-text-area');
    if (!selectedText || !textArea || !textArea.contains(range.commonAncestorContainer)) {
        return;
    }

    // --- Snap Selection Logic --- 
    let startNode = range.startContainer;
    let endNode = range.endContainer;
    let startOffset = range.startOffset;
    let endOffset = range.endOffset;

    // Find the nearest ancestor '.word' span for start and end
    let startWordSpan = startNode.nodeType === Node.ELEMENT_NODE ? startNode : startNode.parentElement;
    while (startWordSpan && !startWordSpan.classList?.contains('word') && startWordSpan !== textArea) {
        startWordSpan = startWordSpan.parentElement;
    }
    let endWordSpan = endNode.nodeType === Node.ELEMENT_NODE ? endNode : endNode.parentElement;
    while (endWordSpan && !endWordSpan.classList?.contains('word') && endWordSpan !== textArea) {
        endWordSpan = endWordSpan.parentElement;
    }

    // If selection starts/ends within a word span, adjust to span boundaries
    if (startWordSpan && startWordSpan.classList?.contains('word')) {
        // Check if the original start was truly inside the text content of the span
        if (startNode !== startWordSpan || startOffset > 0) {
            range.setStartBefore(startWordSpan);
        }
    } // else: Selection started in a separator, keep original start

    if (endWordSpan && endWordSpan.classList?.contains('word')) {
        // Check if the original end was truly inside the text content of the span
        if (endNode !== endWordSpan || endOffset < (endNode.textContent?.length || 0)) {
            range.setEndAfter(endWordSpan);
        }
    } // else: Selection ended in a separator, keep original end
    // --- End Snap Selection Logic ---

    // Get the potentially modified selection text
    selectedText = range.toString().trim();

    // If selection is now empty after snapping (e.g., only whitespace selected), ignore
    if (!selectedText) {
        return;
    }

    // --- Distinguish click vs. drag (based on snapped selection) ---
    // If the final range is collapsed, ignore (was likely a click, handled by handleWordClick)
    if (range.collapsed) {
        return;
    }

    // No longer explicitly ignore single word spans here; allow them to be processed by handleTextSelection if they were selected by dragging.
    // const containedNodes = range.cloneContents().querySelectorAll('.word');
    // const firstNode = range.startContainer.nodeType === Node.ELEMENT_NODE ? range.startContainer : range.startContainer.parentElement;
    // if (containedNodes.length <= 1 && firstNode.classList?.contains('word') && firstNode.textContent === selectedText) {
    //     return;
    // }

    console.log(`Snapped & Selected Phrase: "${selectedText}"`);

    // --- Lookup/Prepare Multi-word Term --- 
    const normalizedPhrase = selectedText.replace(/\s+/g, ' ').trim();

    if (!normalizedPhrase) return; // Ignore if only whitespace normalized

    // Check cache first (case-insensitive)
    const lowerPhrase = normalizedPhrase.toLowerCase();
    let foundTermData = multiwordTermsCache.find(t => t.term.toLowerCase() === lowerPhrase);

    let status = STATUS_UNKNOWN;
    let translation = '';

    if (foundTermData) {
        console.log("Found existing multi-word term in cache.");
        status = foundTermData.status;
        translation = foundTermData.translation || '';
    } else {
        console.log("Multi-word term not found, treating as new.");
        status = STATUS_UNKNOWN;
        translation = '';
    }

    // Remove highlighting from single words
    document.querySelectorAll('#parsed-text-area .word.selected').forEach(el => el.classList.remove('selected'));

    // Populate the editor with the phrase
    populateWordEditor(normalizedPhrase, status, translation);

    // Populate Dictionary Pane for multi-word selection
    populateDictionaryPane(normalizedPhrase);

    // selection.removeAllRanges(); // Optional: Deselect text after processing
}

// --- NEW: Pagination Functions ---

function setupPagination(elements) {
    pagedElements = [];
    pageInfo = []; // Reset page info for new pagination setup
    let currentGlobalParagraphIndex = 0; // Tracks paragraph count from the beginning of all elements

    // First, group elements by paragraphs and identify timestamp groups
    let paragraphGroups = [];
    let currentGroup = [];
    let currentGroupHasTimestamp = false;

    for (let i = 0; i < elements.length; i++) {
        const el = elements[i];
        currentGroup.push(el);

        // Check if this is the end of a paragraph
        if (el.type === 'separator' && el.text.includes('\n')) {
            // Check if this paragraph has a timestamp
            const hasTimestamp = timestamps && timestamps[currentGlobalParagraphIndex];

            if (hasTimestamp) {
                currentGroupHasTimestamp = true;
            }

            // Add the group to paragraphGroups
            paragraphGroups.push({
                elements: [...currentGroup],
                hasTimestamp: currentGroupHasTimestamp
            });

            // Reset for next group
            currentGroup = [];
            currentGroupHasTimestamp = false;
            currentGlobalParagraphIndex++;
        }
    }

    // Add any remaining elements as the last group
    if (currentGroup.length > 0) {
        paragraphGroups.push({
            elements: currentGroup,
            hasTimestamp: timestamps && timestamps[currentGlobalParagraphIndex]
        });
    }

    // Now create pages based on paragraph groups
    let currentPage = [];
    let currentPageSize = 0;
    let currentPageStartIndex = 0;

    for (let i = 0; i < paragraphGroups.length; i++) {
        const group = paragraphGroups[i];
        const groupSize = group.elements.length;

        // If adding this group would exceed the page size and we already have content,
        // start a new page
        if (currentPageSize + groupSize > ELEMENTS_PER_PAGE && currentPageSize > 0) {
            pagedElements.push(currentPage);
            pageInfo.push({
                firstGlobalParagraphIndex: currentPageStartIndex
            });
            currentPage = [];
            currentPageSize = 0;
            currentPageStartIndex = i;
        }

        // Add the group to the current page
        currentPage.push(...group.elements);
        currentPageSize += groupSize;
    }

    // Add the last page if it has content
    if (currentPage.length > 0) {
        pagedElements.push(currentPage);
        pageInfo.push({
            firstGlobalParagraphIndex: currentPageStartIndex
        });
    }

    totalPages = pagedElements.length;

    // Show pagination controls if needed
    const paginationControls = document.getElementById('pagination-controls');
    if (paginationControls) {
        paginationControls.style.display = totalPages > 1 ? 'block' : 'none';
    }

    // Update pagination UI
    updatePaginationUI();
}

function updatePaginationUI() {
    const prevBtn = document.getElementById('prev-page-btn');
    const nextBtn = document.getElementById('next-page-btn');
    const pageInfo = document.getElementById('page-info');

    if (prevBtn) prevBtn.disabled = currentPage <= 1;
    if (nextBtn) nextBtn.disabled = currentPage >= totalPages;
    if (pageInfo) pageInfo.textContent = `Page ${currentPage} of ${totalPages}`;
}

// Add event listeners for pagination
document.addEventListener('DOMContentLoaded', () => {
    const prevBtn = document.getElementById('prev-page-btn');
    const nextBtn = document.getElementById('next-page-btn');

    if (prevBtn) {
        prevBtn.addEventListener('click', () => {
            if (currentPage > 1) {
                const parsedTextArea = document.getElementById('parsed-text-area');
                if (parsedTextArea) {
                    parsedTextArea.scrollTo({
                        top: 0,
                        behavior: 'instant'
                    });
                }
                renderPage(currentPage - 1);
            }
        });
    }

    if (nextBtn) {
        nextBtn.addEventListener('click', () => {
            if (currentPage < totalPages) {
                const parsedTextArea = document.getElementById('parsed-text-area');
                if (parsedTextArea) {
                    parsedTextArea.scrollTo({
                        top: 0,
                        behavior: 'instant'
                    });
                }
                renderPage(currentPage + 1);
            }
        });
    }
});

// Image Repositioning Functionality
document.addEventListener('DOMContentLoaded', function() {
    let isDragging = false;
    let didDrag = false; // Flag to track if actual movement occurred
    let startY, startX;
    let initialClientX, initialClientY; // Store initial mouse coordinates
    let initialBackgroundY, initialBackgroundX;
    let activeImage = null;
    let originalPosition = null;
    const dragThreshold = 5; // Minimum pixels moved to count as a drag
    let activeLink = null; // Store the link being disabled

    // Helper function to get background position
    function getBackgroundPosition(element) {
        const style = window.getComputedStyle(element);
        const position = style.backgroundPosition.split(' ');
        return {
            x: parseFloat(position[0]) || 50,
            y: parseFloat(position[1]) || 50
        };
    }

    // Add click event listeners to reposition buttons specifically on language cards
    document.querySelectorAll('.language-card-image .reposition-btn').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.stopPropagation(); // Stop event from bubbling to the parent link FIRST
            e.preventDefault(); // Prevent default button action (if any)

            console.log("Reposition button clicked"); // Debugging log

            // Find the parent language-card-image
            const imageContainer = this.closest('.language-card-image');
            if (!imageContainer) {
                console.error("Could not find parent .language-card-image");
                return false; // Exit if container not found
            }
            activeImage = imageContainer;

            // Store original position
            originalPosition = imageContainer.style.backgroundPosition || getBackgroundPosition(imageContainer).x + '% ' + getBackgroundPosition(imageContainer).y + '%';
            console.log("Original position stored:", originalPosition);

            // --- Disable the parent link --- 
            activeLink = imageContainer.closest('.language-card-link');
            if (activeLink) {
                activeLink.classList.add('link-disabled');
                console.log("Parent link disabled.");
            } else {
                console.error("Could not find parent .language-card-link to disable.");
            }
            // --- End Disable link ---

            // Find and Show overlay within this specific image container
            const overlay = imageContainer.querySelector('.reposition-overlay');
            if (!overlay) {
                console.error("Could not find .reposition-overlay within the image container");
                return false; // Exit if overlay not found
            }
            overlay.style.display = 'flex'; // Use flex to match CSS
            console.log("Overlay displayed");

            // Add repositioning class to the image container
            imageContainer.classList.add('repositioning');

            return false; // Explicitly prevent further actions
        });
    });

    // Handle drag to reposition
    document.addEventListener('mousedown', function(e) {
        // Only initiate drag if the mousedown is on the active repositioning image or its overlay
        if (activeImage && activeImage.classList.contains('repositioning') &&
            (e.target === activeImage || activeImage.contains(e.target))) {

            isDragging = true;
            didDrag = false; // Reset drag flag
            const rect = activeImage.getBoundingClientRect();
            startX = e.clientX - rect.left;
            startY = e.clientY - rect.top;
            initialClientX = e.clientX; // Store initial mouse position
            initialClientY = e.clientY;

            const bgPosition = getBackgroundPosition(activeImage);
            initialBackgroundX = bgPosition.x;
            initialBackgroundY = bgPosition.y;

            // Prevent text selection during drag
            e.preventDefault();
        }
    }, true); // Use capture phase for mousedown to potentially prevent other actions

    document.addEventListener('mousemove', function(e) {
        if (!isDragging || !activeImage) return;

        // Check if drag threshold is exceeded
        const deltaXmouse = Math.abs(e.clientX - initialClientX);
        const deltaYmouse = Math.abs(e.clientY - initialClientY);
        if (!didDrag && (deltaXmouse > dragThreshold || deltaYmouse > dragThreshold)) {
            didDrag = true; // Set the flag indicating a real drag occurred
            console.log("Drag threshold exceeded.");
        }

        // Note: We update position even if threshold not met, but didDrag flag controls click prevention
        // if (!didDrag) return; // Removed this line - update visually immediately

        const rect = activeImage.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        // Calculate movement relative to the start of the drag within the element
        const deltaX = (x - startX);
        const deltaY = (y - startY);

        // Calculate percentage change based on element size
        const percentDeltaX = (deltaX / rect.width) * 100;
        const percentDeltaY = (deltaY / rect.height) * 100;

        // Apply the delta to the initial background position
        // Note: Subtracting delta moves the background opposite to the mouse direction
        const newX = Math.max(0, Math.min(100, initialBackgroundX - percentDeltaX));
        const newY = Math.max(0, Math.min(100, initialBackgroundY - percentDeltaY));

        activeImage.style.backgroundPosition = `${newX}% ${newY}%`;
    });

    document.addEventListener('mouseup', function(e) {
        if (isDragging) {
            console.log("Mouse up, drag sequence finished. Drag occurred:", didDrag);
            isDragging = false;
            // IMPORTANT: Do NOT reset didDrag here. Let the click handler check it.
        }
    }, true); // Use capture phase for mouseup

    // Add click listener to links in CAPTURE phase to check for preceding drag
    document.querySelectorAll('.language-card-link').forEach(link => {
        link.addEventListener('click', function(e) {
            if (didDrag) {
                console.log("Click prevented following drag operation.");
                e.preventDefault();
                e.stopPropagation();
                didDrag = false; // Reset flag *after* preventing click
                return false; // Explicitly stop processing
            } else {
                console.log("Click allowed (no preceding drag detected).");
                // Allow normal click behavior
            }
        }, true); // Use capture phase (true)
    });

    // Handle save position
    document.querySelectorAll('.save-position-btn').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.stopPropagation(); // Stop bubbling
            e.preventDefault(); // Prevent default
            if (!activeImage) return false;

            const position = activeImage.style.backgroundPosition;
            console.log("Save button clicked. Saving position:", position);

            // --- Get Language ID and Make API call --- 
            const langCard = activeImage.closest('.language-card');
            const langId = langCard ? langCard.dataset.languageId : null;

            if (langId) {
                // Show some loading indicator maybe?
                fetch(`/api/language/${langId}/update_bg_position`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            // Add CSRF token header if needed by your Flask setup
                            // 'X-CSRFToken': '{{ csrf_token() }}' // Example if using Flask-WTF
                        },
                        body: JSON.stringify({
                            position: position
                        })
                    })
                    .then(response => {
                        if (!response.ok) {
                            // Attempt to parse error message from JSON response
                            return response.json().then(errData => {
                                throw new Error(errData.error || `HTTP error ${response.status}`);
                            }).catch(() => {
                                // Fallback if parsing error response fails
                                throw new Error(`HTTP error ${response.status}`);
                            });
                        }
                        return response.json();
                    })
                    .then(data => {
                        if (data.success) {
                            console.log("Position saved successfully via API");
                            // Optionally update a data attribute on success if needed elsewhere
                            // activeImage.dataset.bgPosition = position; 
                        } else {
                            console.error("API reported failure to save position:", data.error);
                            alert("Failed to save position: " + (data.error || "Unknown error"));
                            // Revert visual change if save failed
                            activeImage.style.backgroundPosition = originalPosition;
                        }
                    })
                    .catch(error => {
                        console.error("Error during fetch to save position:", error);
                        alert("Error saving position: " + error.message);
                        // Revert visual change on fetch error
                        activeImage.style.backgroundPosition = originalPosition;
                    })
                    .finally(() => {
                        // Hide loading indicator?
                        cleanup(); // Cleanup UI regardless of success/failure
                    });
            } else {
                console.error("Could not find language ID to save position.");
                alert("Could not save position: Language ID missing.");
                cleanup(); // Still cleanup UI
            }
            // --- End API Call --- 

            // Hide overlay and cleanup - MOVED TO .finally() block
            // cleanup();
        });
    });

    // Handle cancel
    document.querySelectorAll('.cancel-position-btn').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation(); // Also stop propagation here
            if (!activeImage || !originalPosition) return false;

            // Restore original position
            activeImage.style.backgroundPosition = originalPosition;
            console.log("Cancel button clicked. Position restored to:", originalPosition);

            // Cleanup
            cleanup();
            // didDrag = false; // Reset happens in cleanup now
            return false;
        });
    });

    // Cleanup function
    function cleanup() {
        if (!activeImage) return;

        const overlay = activeImage.querySelector('.reposition-overlay');
        if (overlay) overlay.style.display = 'none'; // Hide overlay
        activeImage.classList.remove('repositioning');

        // --- Re-enable the link --- 
        if (activeLink) {
            activeLink.classList.remove('link-disabled');
            console.log("Parent link re-enabled.");
            activeLink = null; // Clear the reference
        }
        // --- End Re-enable link ---

        activeImage = null;
        originalPosition = null;
        isDragging = false;
        didDrag = false; // Ensure reset in cleanup
    }
});

// TODO:
// - Implement API endpoint and JS logic for UPDATING word status/translation.
// - Add event listeners for word editor buttons.
// - Refine text parsing (e.g., better handling of punctuation, potentially basic lemmatization if needed).
// - Add visual feedback during API calls (loading spinners).
// - CSS for the .selected word highlight. 

// Function to create the tooltip element
function createTooltipElement() {
    if (!definitionTooltip) {
        definitionTooltip = document.createElement('div');
        definitionTooltip.id = 'definition-tooltip';
        // Keep essential JS styles for positioning/visibility
        definitionTooltip.style.position = 'absolute';
        definitionTooltip.style.display = 'none'; // Start hidden
        definitionTooltip.style.zIndex = '1000'; // Ensure it's on top
        definitionTooltip.style.pointerEvents = 'none'; // Prevent interference
        document.body.appendChild(definitionTooltip);
    }
}

// Function to show the tooltip
function showTooltip(element, text) {
    if (!definitionTooltip || !text) return; // Don't show if no tooltip or text

    // Replace newlines with <br> tags and use innerHTML
    const formattedText = escapeHtml(text).replace(/\n/g, '<br>');
    definitionTooltip.innerHTML = formattedText;

    definitionTooltip.style.display = 'block';

    // Position the tooltip above the element
    const rect = element.getBoundingClientRect();
    let top = rect.top + window.scrollY - definitionTooltip.offsetHeight - 5; // 5px buffer
    let left = rect.left + window.scrollX + (rect.width / 2) - (definitionTooltip.offsetWidth / 2);

    // Adjust if tooltip goes off-screen left/right
    if (left < 0) left = 5;
    if (left + definitionTooltip.offsetWidth > window.innerWidth) {
        left = window.innerWidth - definitionTooltip.offsetWidth - 5;
    }
    // Adjust if tooltip goes off-screen top
    if (top < window.scrollY) {
        top = rect.bottom + window.scrollY + 5; // Position below if no space above
    }


    definitionTooltip.style.top = `${top}px`;
    definitionTooltip.style.left = `${left}px`;
}

// Function to hide the tooltip
function hideTooltip() {
    if (definitionTooltip) {
        definitionTooltip.style.display = 'none';
    }
}

function renderPage(pageNumber) {
    if (pageNumber < 1 || pageNumber > totalPages) {
        console.error("Invalid page number:", pageNumber);
        return;
    }

    // Prevent page changes only in single-page repeat mode while video is playing
    if (currentRepeatMode === 'page' && pageNumber !== currentPage && isVideoPlaying) {
        console.log("Single-page repeat mode active: preventing page change");
        return;
    }

    const oldCurrentPage = currentPage; // Store the current page before updating
    currentPage = pageNumber;

    // Stop any active repeat loop when page changes, but only if not in 'range' mode
    if (repeatLoopInterval && currentRepeatMode !== 'range') {
        toggleRepeatMode(currentRepeatMode); // Calling with current mode stops it
    }

    const elementsToRender = pagedElements[currentPage - 1] || [];
    const parsedTextArea = document.getElementById('parsed-text-area');
    const textContainer = document.getElementById('text-container');
    const leftPane = document.querySelector('.left-pane');

    // NEW: Get the global paragraph offset for the current page
    const currentPageInfo = pageInfo[currentPage - 1];
    const globalParagraphOffset = currentPageInfo ? currentPageInfo.firstGlobalParagraphIndex : 0;

    let styledHtml;
    try {
        // Check if timestamps exist and are in the expected format
        if (timestamps && Array.isArray(timestamps) && timestamps.length > 0) {
            console.log("Rendering with timestamps");
            // Pass the globalParagraphOffset to buildStyledHtmlWithTimestamps
            styledHtml = buildStyledHtmlWithTimestamps(elementsToRender, vocabCache, multiwordTermsCache, timestamps, globalParagraphOffset);
        } else {
            console.log("No valid timestamps found, rendering without timestamps");
            styledHtml = buildStyledHtml(elementsToRender, vocabCache, multiwordTermsCache);
        }
    } catch (error) {
        console.error("Error rendering page:", error);
        // Fallback to non-timestamp rendering if there's an error
        styledHtml = buildStyledHtml(elementsToRender, vocabCache, multiwordTermsCache);
    }
    if (parsedTextArea) {
        parsedTextArea.innerHTML = styledHtml;
        addWordClickListeners();
        // Call new function to attach timestamp click listeners
        attachTimestampClickListeners();

        // Attach text selection listener
        // Remove previous listener to avoid duplicates if re-rendering the same page
        parsedTextArea.removeEventListener('mouseup', handleTextSelection);
        parsedTextArea.addEventListener('mouseup', handleTextSelection);

        // Only reset scroll positions if the page is actually changing
        if (pageNumber !== oldCurrentPage) {
            parsedTextArea.scrollTop = 0;
            if (textContainer) textContainer.scrollTop = 0;
            if (leftPane) leftPane.scrollTop = 0;
        }
    } else {
        console.error("#parsed-text-area not found during renderPage");
    }
    updatePaginationUI();
}

// --- NEW: Attach Timestamp Click Listeners (Centralized) ---
function attachTimestampClickListeners() {
    // DEBUG: Attempting to update this function.
    console.log("Attaching timestamp click listeners...");
    document.querySelectorAll('.timestamp-badge').forEach(badge => {
        badge.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            console.log("Timestamp badge clicked:", this.dataset.timestamp);

            const ts = parseInt(this.dataset.timestamp, 10);
            if (isNaN(ts)) {
                console.error("Invalid timestamp value:", this.dataset.timestamp);
                return;
            }

            const activePlayer = getCurrentPlayer(); // Use helper
            if (!activePlayer) {
                console.error("No active media player found for timestamp click.");
                return;
            }

            try {
                // If sentence repeat is active, update the loop target
                if (currentRepeatMode === 'sentence') {
                    const clickedParagraph = this.closest('.lesson-paragraph');
                    if (clickedParagraph && clickedParagraph.dataset.timestamp) {
                        const paragraphStartTime = parseInt(clickedParagraph.dataset.timestamp, 10);

                        const paragraphsOnPage = Array.from(document.querySelectorAll('.lesson-paragraph'));
                        const clickedParagraphIndexInPage = paragraphsOnPage.indexOf(clickedParagraph);

                        const currentPageInfo = pageInfo[currentPage - 1];
                        const globalParagraphOffset = currentPageInfo ? currentPageInfo.firstGlobalParagraphIndex : 0;

                        const selectedParagraphGlobalIndex = globalParagraphOffset + clickedParagraphIndexInPage;

                        let paragraphEndTime;
                        // Option 1: If there is a next global timestamp, use it as the end time
                        if (selectedParagraphGlobalIndex + 1 < timestamps.length) {
                            paragraphEndTime = timestamps[selectedParagraphGlobalIndex + 1].timestamp;
                        } else {
                            // Option 2: If it's the last timestamped paragraph on the current page,
                            // use the timestamp of the first paragraph on the next page as the end.
                            const nextPageInfo = pageInfo[currentPage]; // currentPage is 1-indexed
                            if (nextPageInfo && timestamps[nextPageInfo.firstGlobalParagraphIndex]) { // Ensure next page has a timestamp
                                paragraphEndTime = timestamps[nextPageInfo.firstGlobalParagraphIndex].timestamp;
                            } else {
                                // Option 3: It's genuinely the last paragraph of the entire text,
                                // or no next page exists. Use player duration or a short buffer.
                                paragraphEndTime = getCurrentPlayerDuration(); // Use helper function
                            }
                        }

                        // DO NOT call toggleRepeatMode here if already in sentence mode
                        // Instead, just update the repeat loop boundaries directly
                        repeatLoopStartTime = paragraphStartTime;
                        repeatLoopEndTime = Math.min(paragraphEndTime + 0.5, getCurrentPlayerDuration()); // Add buffer

                        console.log(`Sentence repeat retargeted: Start=${repeatLoopStartTime}, End=${repeatLoopEndTime}`);

                        // Seek to new sentence start immediately on active player
                        seekPlayerTo(paragraphStartTime); // Use helper
                        activePlayer.play();
                        return; // Important: return to prevent falling through to regular click behavior
                    }
                }

                // Regular timestamp click behavior (if repeat mode is NOT sentence OR no paragraph found)
                console.log("Seeking to timestamp:", ts);
                seekPlayerTo(ts); // Use helper
                activePlayer.play();
            } catch (error) {
                console.error("Error handling timestamp click:", error);
            }
        });
    });
}

// --- NEW: Repeat Controls Initialization ---
function initializeRepeatControls() {
    const repeatPageBtn = document.getElementById('repeat-page-btn');
    const repeatSentenceBtn = document.getElementById('repeat-sentence-btn');

    if (repeatPageBtn) {
        repeatPageBtn.addEventListener('click', () => {
            toggleRepeatMode('page');
        });
    }

    if (repeatSentenceBtn) {
        repeatSentenceBtn.addEventListener('click', (event) => {
            // For sentence repeat, we need to know WHICH sentence is selected.
            // This will typically come from a word click or specific paragraph selection.
            // For now, let's assume it operates on the currently highlighted sentence if any, or the first sentence on the page.
            // A more robust solution might require selecting a sentence first.
            const selectedParagraph = document.querySelector('.lesson-paragraph.current-segment'); // Or the currently highlighted sentence
            if (selectedParagraph && selectedParagraph.dataset.timestamp) {
                const paragraphStartTime = parseInt(selectedParagraph.dataset.timestamp, 10);
                // Find the next paragraph's timestamp to get the end of the current sentence.
                // This requires iterating through paragraphs on the current page.
                const paragraphsOnPage = Array.from(document.querySelectorAll('.lesson-paragraph'));
                const currentIndex = paragraphsOnPage.indexOf(selectedParagraph);
                let paragraphEndTime;

                // Try to find the next paragraph's timestamp on the current page
                if (currentIndex !== -1 && currentIndex + 1 < paragraphsOnPage.length) {
                    const nextParagraph = paragraphsOnPage[currentIndex + 1];
                    if (nextParagraph.dataset.timestamp) {
                        paragraphEndTime = parseInt(nextParagraph.dataset.timestamp, 10);
                    }
                }

                // If no next paragraph on current page or no timestamp, consider next page's start
                if (paragraphEndTime === undefined) { // Check if it's still undefined from above
                    const currentPageInfo = pageInfo[currentPage - 1];
                    const globalParagraphOffset = currentPageInfo ? currentPageInfo.firstGlobalParagraphIndex : 0;
                    const selectedParagraphGlobalIndex = globalParagraphOffset + currentIndex;

                    const nextPageInfo = pageInfo[currentPage]; // currentPage is 1-indexed
                    if (nextPageInfo) {
                        paragraphEndTime = timestamps[nextPageInfo.firstGlobalParagraphIndex].timestamp;
                    } else {
                        // If it's truly the last paragraph of the entire text
                        paragraphEndTime = getCurrentPlayerDuration(); // Use helper function
                    }
                }

                toggleRepeatMode('sentence', paragraphStartTime, paragraphEndTime);
            } else if (timestamps && timestamps.length > 0) {
                // Fallback: If no sentence is selected, repeat the first one on the current page.
                const firstParagraphElement = document.querySelector('.lesson-paragraph');
                if (firstParagraphElement && firstParagraphElement.dataset.timestamp) {
                    const firstSentenceStartTime = parseInt(firstParagraphElement.dataset.timestamp, 10);
                    const paragraphsOnPage = Array.from(document.querySelectorAll('.lesson-paragraph'));
                    let firstSentenceEndTime = getCurrentPlayerDuration();
                    if (paragraphsOnPage.length > 1 && paragraphsOnPage[1].dataset.timestamp) {
                        firstSentenceEndTime = parseInt(paragraphsOnPage[1].dataset.timestamp, 10);
                    }
                    toggleRepeatMode('sentence', firstSentenceStartTime, firstSentenceEndTime);
                } else {
                    console.warn("Cannot repeat sentence: No timestamped paragraphs on current page.");
                }
            } else {
                console.warn("Cannot repeat sentence: No sentence selected and no timestamps available.");
            }
        });
    }
}

function toggleRepeatMode(mode, startTime = null, endTime = null) {
    if (!timestamps) {
        console.warn("Timestamps not loaded yet – repeat mode cannot start.");
        return false;
    }
    // Proceed even if player is not ready; the loop interval will wait until it becomes ready.

    // Stop any existing loop
    if (repeatLoopInterval) {
        clearInterval(repeatLoopInterval);
        repeatLoopInterval = null;
        // Remove highlighting from all repeat buttons
        document.querySelectorAll('#pagination-controls button.active-repeat').forEach(btn => {
            btn.classList.remove('active-repeat');
        });
    }

    // If the same mode is clicked again:
    if (currentRepeatMode === mode) {
        // For page or sentence mode, clicking again turns it off.
        // For range mode, if new start/end provided, treat as update instead of turning off.
        if (mode === 'range' && startTime !== null) {
            console.log("Updating existing range repeat with new parameters.");
        } else {
            currentRepeatMode = null;
            isRepeatModeActive = false;
            console.log("Repeat mode stopped.");
            return isRepeatModeActive; // Return false for 'off'
        }
    }

    // Set new mode and activate repeat state
    currentRepeatMode = mode;
    isRepeatModeActive = true;
    console.log(`Starting repeat mode: ${mode}`);

    // Highlight the active button
    const repeatBtn = document.getElementById(`repeat-${mode}-btn`);
    if (repeatBtn) {
        repeatBtn.classList.add('active-repeat');
    }

    if (mode === 'page') {
        const currentPageInfo = pageInfo[currentPage - 1];
        const firstParagraphGlobalIndexOnPage = currentPageInfo ? currentPageInfo.firstGlobalParagraphIndex : 0;
        const firstParagraphElement = document.querySelector('.lesson-paragraph[data-timestamp]');

        if (!firstParagraphElement || !firstParagraphElement.dataset.timestamp) {
            console.warn("No timestamped paragraphs found on the current page for page repeat.");
            currentRepeatMode = null;
            return false;
        }

        repeatLoopStartTime = parseInt(firstParagraphElement.dataset.timestamp, 10);

        const nextPageInfo = pageInfo[currentPage];
        if (nextPageInfo) {
            repeatLoopEndTime = timestamps[nextPageInfo.firstGlobalParagraphIndex].timestamp;
        } else {
            repeatLoopEndTime = getCurrentPlayerDuration();
        }
        repeatLoopEndTime = Math.min(repeatLoopEndTime + 0.5, getCurrentPlayerDuration());

    } else if (mode === 'sentence') {
        if (startTime !== null && endTime !== null) {
            repeatLoopStartTime = startTime;
            repeatLoopEndTime = endTime;
        } else {
            console.warn("Sentence repeat called without start or end time.");
            currentRepeatMode = null;
            isRepeatModeActive = false;
            if (repeatBtn) repeatBtn.classList.remove('active-repeat');
            return isRepeatModeActive;
        }
        repeatLoopEndTime = Math.min(repeatLoopEndTime + 0.5, getCurrentPlayerDuration());

    } else if (mode === 'range') {
        if (startTime !== null) {
            repeatLoopStartTime = startTime;
        } else {
            console.warn("Range repeat called without a valid start time.");
            currentRepeatMode = null;
            isRepeatModeActive = false;
            if (repeatBtn) repeatBtn.classList.remove('active-repeat');
            return isRepeatModeActive;
        }
        // endTime may be null if the range should extend to the end of the media.
        if (endTime !== null) {
            repeatLoopEndTime = endTime;
        } else {
            // Defer calculation until the player is ready; set to 0 for now.
            repeatLoopEndTime = 0;
        }
    }

    console.log(`Repeat loop set: Start=${repeatLoopStartTime}, End=${repeatLoopEndTime}.`);

    // Start the interval to check playback position
    repeatLoopInterval = setInterval(() => {
        // If repeat mode was deactivated elsewhere, clean up
        if (!isRepeatModeActive || currentRepeatMode !== 'range') {
            clearInterval(repeatLoopInterval);
            repeatLoopInterval = null;
            return;
        }

        const player = getCurrentPlayer();
        if (!player) return; // Wait until player is ready

        // If the end time was unknown when repeat started (0 or null), set it now.
        if (!repeatLoopEndTime || repeatLoopEndTime <= 0) {
            repeatLoopEndTime = getCurrentPlayerDuration();
            console.log("Updated repeatLoopEndTime to:", repeatLoopEndTime);
            return; // Wait for next interval to check again
        }

        const currentTime = getCurrentPlayerTime();
        // Add a small buffer (0.5s) to handle cases where we slightly overshoot the end time
        if (currentTime >= repeatLoopEndTime - 0.5) {
            console.log(`Looping from ${currentTime}s back to ${repeatLoopStartTime}s`);
            
            // First seek to the start time
            seekPlayerTo(repeatLoopStartTime);
            
            // Force play if not already playing
            const isPlaying = player === window.player ? 
                player.getPlayerState() === YT.PlayerState.PLAYING : 
                !player.paused;
                
            if (!isPlaying) {
                if (player === window.player) {
                    player.playVideo();
                } else {
                    player.play().catch(e => console.error("Error restarting player:", e));
                }
            }
            
            // Force update the current segment to ensure highlighting updates
            setTimeout(() => {
                updateCurrentSegment(repeatLoopStartTime);
            }, 50);
        }
    }, 100); // Check every 100ms

    return isRepeatModeActive;
}

// --- New Video Sync Functions ---
function initializeVideoSync() {
    console.log("initializeVideoSync started.");

    // Initialize YouTube player if URL exists
    const videoContainer = document.getElementById('video-player-container');
    if (!videoContainer) {
        console.error("initializeVideoSync: video-player-container not found.");
        return;
    }

    const youtubeUrl = videoContainer.dataset.youtubeUrl;
    if (!youtubeUrl) {
        console.log("initializeVideoSync: No youtubeUrl data attribute found.");
        return;
    }

    const videoId = extractYouTubeId(youtubeUrl);
    if (!videoId) {
        console.error("initializeVideoSync: Could not extract video ID from URL:", youtubeUrl);
        return;
    }

    console.log("initializeVideoSync: Initializing YouTube player for video ID:", videoId);

    // Clean up any existing player and intervals
    if (window.player) {
        console.log("Cleaning up existing YouTube player instance");
        try {
            window.player.destroy();
            window.player = null;
        } catch (e) {
            console.error("Error cleaning up existing player:", e);
        }
    }

    // Clear any existing sync intervals
    if (syncInterval) {
        clearInterval(syncInterval);
        syncInterval = null;
    }

    // Load YouTube IFrame API if not already loaded
    if (typeof YT === 'undefined' || typeof YT.Player === 'undefined') {
        console.log("YouTube IFrame API not loaded. Loading now...");
        
        // Remove any existing script tag to prevent multiple loads
        const existingScript = document.querySelector('script[src*="youtube.com/iframe_api"]');
        if (existingScript) {
            existingScript.remove();
        }
        
        // Create new script tag
        const tag = document.createElement('script');
        tag.src = 'https://www.youtube.com/iframe_api';
        const firstScriptTag = document.getElementsByTagName('script')[0];
        firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
        
        // Set a timeout to handle case where API fails to load
        const apiLoadTimeout = setTimeout(() => {
            if (typeof YT === 'undefined' || typeof YT.Player === 'undefined') {
                console.error("YouTube IFrame API failed to load within timeout");
            }
        }, 5000);
        
        // Clean up timeout when API loads
        const originalOnYouTubeIframeAPIReady = window.onYouTubeIframeAPIReady || function() {};
        window.onYouTubeIframeAPIReady = function() {
            clearTimeout(apiLoadTimeout);
            originalOnYouTubeIframeAPIReady();
            initializeYouTubePlayer(videoId);
        };
    } else {
        console.log("YouTube IFrame API already loaded. Creating player directly.");
        initializeYouTubePlayer(videoId);
    }
}

// Separate function to initialize the YouTube player
function initializeYouTubePlayer(videoId) {
    console.log("Creating YouTube player with video ID:", videoId);
    
    try {
        window.player = new YT.Player('video-player-container', {
            height: '200',
            width: '100%',
            videoId: videoId,
            playerVars: {
                'playsinline': 1,
                'enablejsapi': 1,
                'origin': window.location.origin,
                'rel': 0, // Don't show related videos at the end
                'modestbranding': 1, // Less YouTube branding
                'fs': 0, // Disable fullscreen button
                'iv_load_policy': 3, // Don't show annotations
                'disablekb': 1 // Disable keyboard controls
            },
            events: {
                'onReady': function(event) {
                    console.log("YouTube player ready event received");
                    onPlayerReady(event);
                },
                'onStateChange': function(event) {
                    console.log("YouTube player state changed:", getPlayerStateName(event.data));
                    onPlayerStateChange(event);
                },
                'onError': function(event) {
                    console.error("YouTube player error:", event.data);
                    alert("Error loading YouTube video. Please try refreshing the page.");
                },
                'onPlaybackQualityChange': function(event) {
                    console.log("Playback quality changed:", event.data);
                },
                'onPlaybackRateChange': function() {
                    console.log("Playback rate changed");
                },
                'onApiChange': function() {
                    console.log("YouTube player API changed");
                }
            }
        });
        
        console.log("YouTube player instance created successfully");
    } catch (error) {
        console.error("Error creating YouTube player:", error);
        alert("Failed to initialize YouTube player. Please try refreshing the page.");
    }
}

// NEW: HTML5 Player Sync Initialization
function initializeHtml5PlayerSync() {
    console.log("initializeHtml5PlayerSync started.");
    const html5MediaElement = document.getElementById('html5-player');
    if (!html5MediaElement) {
        console.error("initializeHtml5PlayerSync: html5-player element not found.");
        return;
    }

    html5Player = html5MediaElement; // Assign to global variable

    // Attach event listeners for HTML5 media player
    html5Player.addEventListener('play', () => {
        isVideoPlaying = true;
        startVideoSync();
    });
    html5Player.addEventListener('pause', () => {
        isVideoPlaying = false;
        stopVideoSync();
    });
    html5Player.addEventListener('ended', () => {
        isVideoPlaying = false;
        stopVideoSync();
    });

    // Attach timestamp click listeners for HTML5 player as well
    attachTimestampClickListeners();
}

function onPlayerReady(event) {
    console.log("YouTube player ready.");
    // Enable timestamp clicks
    attachTimestampClickListeners();
    // Removed: Start video sync if timestamps exist - This is now handled by onPlayerStateChange
    // if (timestamps && Array.isArray(timestamps) && timestamps.length > 0) {
    //     startVideoSync();
    // }
}

function onPlayerStateChange(event) {
    if (event.data === YT.PlayerState.PLAYING) {
        isVideoPlaying = true;
        // Only start video sync if not in repeat mode
        if (!isRepeatModeActive) {
            startVideoSync();
        }
    } else if (event.data === YT.PlayerState.PAUSED || event.data === YT.PlayerState.ENDED) {
        isVideoPlaying = false;
        // Only stop video sync if not in repeat mode
        if (!isRepeatModeActive) {
            stopVideoSync();
        }
    }
}

function startVideoSync() {
    // Clear any existing interval to prevent duplicates
    stopVideoSync();
    
    console.log("Starting video sync interval");
    
    syncInterval = setInterval(() => {
        try {
            const currentTime = getCurrentPlayerTime();
            if (currentTime > 0 || window.player?.getPlayerState?.() === YT.PlayerState.PLAYING) {
                updateCurrentSegment(currentTime);
            } else {
                console.log("Skipping update - current time is zero and player not playing");
            }
        } catch (error) {
            console.error("Error in video sync interval:", error);
            // Attempt to recover by stopping and restarting the sync
            stopVideoSync();
            if (window.player?.playVideo) {
                console.log("Attempting to recover by restarting video sync...");
                setTimeout(startVideoSync, 1000);
            }
        }
    }, 100); // Update every 100ms
}

function stopVideoSync() {
    if (syncInterval) {
        console.log("Stopping video sync interval");
        clearInterval(syncInterval);
        syncInterval = null;
    } else {
        console.log("No active video sync interval to stop");
    }
}

function updateCurrentSegment(time) {
    console.log(`updateCurrentSegment entry: time=${time}, timestampOffset=${timestampOffset}`);
    // Apply the global offset to the current time
    const adjustedTime = time + timestampOffset;
    console.log(`updateCurrentSegment: Current time: ${time}, Adjusted time with offset ${timestampOffset}: ${adjustedTime}`);

    // If no timestamps, exit early
    if (!timestamps || !Array.isArray(timestamps) || timestamps.length === 0) {
        console.log("updateCurrentSegment: No timestamps available.");
        return;
    }

    // Find the current segment based on the adjusted time
    let currentSegmentGlobalIndex = -1;
    for (let i = 0; i < timestamps.length; i++) {
        if (adjustedTime >= timestamps[i].timestamp) {
            currentSegmentGlobalIndex = i;
        } else {
            break;
        }
    }

    if (currentSegmentGlobalIndex === -1) {
        console.log("updateCurrentSegment: No matching segment found for time:", adjustedTime);
        return;
    }

    // Always update highlighting regardless of video state
    updateHighlighting(currentSegmentGlobalIndex);

    // Only handle auto-scrolling if video is playing
    if (isVideoPlaying) {
        handleAutoScrolling(currentSegmentGlobalIndex);
    }
}

// New function to handle highlighting separately
function updateHighlighting(currentSegmentGlobalIndex) {
    // Highlighting is allowed if autoscroll is on OR repeat mode is active.
    // Auto-pagination is ONLY allowed if autoscroll is on.
    const allowHighlight = isAutoscrollEnabled || isRepeatModeActive;
    const allowPagination = isAutoscrollEnabled;

    if (!allowHighlight) {
        return; // Exit if no highlighting is needed at all
    }
    // Determine which page this segment belongs to
    let targetPage = currentPage;
    let foundPage = false;

    for (let i = 0; i < pageInfo.length; i++) {
        const pageStartGlobalIndex = pageInfo[i].firstGlobalParagraphIndex;
        const nextPageStartGlobalIndex = (i + 1 < pageInfo.length) ? pageInfo[i + 1].firstGlobalParagraphIndex : Infinity;

        if (currentSegmentGlobalIndex >= pageStartGlobalIndex && currentSegmentGlobalIndex < nextPageStartGlobalIndex) {
            targetPage = i + 1;
            foundPage = true;
            break;
        }
    }

    if (!foundPage) {
        console.warn("updateHighlighting: Could not find page for segment index:", currentSegmentGlobalIndex);
        return;
    }

    // Prevent auto-pagination only for single-page repeat mode
    if (targetPage !== currentPage && currentRepeatMode === 'page') {
        console.log("updateHighlighting: Page change prevented due to single-page repeat mode");
        return;
    }

    // If we need to change pages for highlighting, and pagination is allowed
    if (targetPage !== currentPage && allowPagination) {
        console.log(`updateHighlighting: Page change needed for highlighting. Current: ${currentPage}, Target: ${targetPage}`);
        renderPage(targetPage);
        return;
    }

    // Update highlighting on current page
    const currentPageInfo = pageInfo[currentPage - 1];
    const globalParagraphOffset = currentPageInfo ? currentPageInfo.firstGlobalParagraphIndex : 0;
    const relativeParagraphIndex = currentSegmentGlobalIndex - globalParagraphOffset;

    // Remove highlight from all paragraphs
    document.querySelectorAll('.lesson-paragraph').forEach(p => {
        p.classList.remove('current-segment');
    });

    // Add highlight to current paragraph
    const paragraphs = document.querySelectorAll('.lesson-paragraph');
    if (paragraphs[relativeParagraphIndex]) {
        paragraphs[relativeParagraphIndex].classList.add('current-segment');
    }
}

// New function to handle auto-scrolling separately
function handleAutoScrolling(currentSegmentGlobalIndex) {
    if (!isAutoscrollEnabled) return; // Autoscroll is disabled by the user
    // Check if user has recently scrolled
    const now = Date.now();
    const userRecentlyScrolled = (now - lastUserScrollTime) < USER_SCROLL_TIMEOUT;
    if (userRecentlyScrolled) {
        console.log("handleAutoScrolling: User recently scrolled, skipping auto-scroll");
        return;
    }

    // Determine which page this segment belongs to
    let targetPage = currentPage;
    let foundPage = false;

    for (let i = 0; i < pageInfo.length; i++) {
        const pageStartGlobalIndex = pageInfo[i].firstGlobalParagraphIndex;
        const nextPageStartGlobalIndex = (i + 1 < pageInfo.length) ? pageInfo[i + 1].firstGlobalParagraphIndex : Infinity;

        if (currentSegmentGlobalIndex >= pageStartGlobalIndex && currentSegmentGlobalIndex < nextPageStartGlobalIndex) {
            targetPage = i + 1;
            foundPage = true;
            break;
        }
    }

    if (!foundPage) {
        console.warn("handleAutoScrolling: Could not find page for segment index:", currentSegmentGlobalIndex);
        return;
    }

    // If we need to change pages and repeat mode is active, don't change pages
    if (targetPage !== currentPage && isRepeatModeActive) {
        console.log("handleAutoScrolling: Page change prevented due to repeat mode");
        return;
    }

    // If we need to change pages
    if (targetPage !== currentPage) {
        console.log(`handleAutoScrolling: Page change needed. Current: ${currentPage}, Target: ${targetPage}`);
        const parsedTextArea = document.getElementById('parsed-text-area');
        if (parsedTextArea) {
            parsedTextArea.scrollTop = 0;
        }
        renderPage(targetPage);
        return;
    }

    // Scroll current segment into view if needed
    const currentPageInfo = pageInfo[currentPage - 1];
    const globalParagraphOffset = currentPageInfo ? currentPageInfo.firstGlobalParagraphIndex : 0;
    const relativeParagraphIndex = currentSegmentGlobalIndex - globalParagraphOffset;

    const paragraphs = document.querySelectorAll('.lesson-paragraph');
    if (paragraphs[relativeParagraphIndex]) {
        paragraphs[relativeParagraphIndex].scrollIntoView({
            behavior: 'smooth',
            block: 'center'
        });
    }
}

// --- NEW: Timestamp Adjustment Modal Initialization ---
function initializeTimestampAdjustment() {
    const adjustButton = document.getElementById('adjust-timestamps-btn');
    const modal = document.getElementById('timestamp-adjust-modal');
    const closeButton = modal.querySelector('.close-button');
    const saveButton = document.getElementById('save-offset-btn');
    const cancelButton = document.getElementById('cancel-offset-btn');
    const offsetInput = document.getElementById('offset-input');

    if (!adjustButton || !modal || !closeButton || !saveButton || !cancelButton || !offsetInput) {
        console.error("Timestamp adjustment modal elements not found. Skipping initialization.");
        return;
    }

    // Function to open the modal
    function openModal() {
        modal.style.display = 'block';
        offsetInput.value = timestampOffset; // Set current offset in input
    }

    // Function to close the modal
    function closeModal() {
        modal.style.display = 'none';
    }

    // Event listeners
    adjustButton.addEventListener('click', openModal);
    closeButton.addEventListener('click', closeModal);
    cancelButton.addEventListener('click', closeModal);

    saveButton.addEventListener('click', () => {
        const newOffset = parseFloat(offsetInput.value);
        if (!isNaN(newOffset)) {
            timestampOffset = newOffset;
            console.log("Timestamp offset updated to:", timestampOffset);

            // Save the offset to the server
            fetch(`/lesson/${currentLessonId}/update_offset`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        offset: newOffset
                    })
                })
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                        console.log("Offset saved successfully");
                    } else {
                        console.error("Failed to save offset:", data.error);
                    }
                })
                .catch(error => {
                    console.error("Error saving offset:", error);
                });

            // Re-render the page to apply new offset to timestamp badges
            renderPage(currentPage);
        } else {
            alert("Please enter a valid number for the offset.");
        }
        closeModal();
    });

    // Close modal if clicked outside
    window.addEventListener('click', (event) => {
        if (event.target === modal) {
            closeModal();
        }
    });

    console.log("Timestamp adjustment initialized.");
}

// --- Flashcard Review Functions (moved to global scope) ---
function loadReviewCards() {
    fetch(`/api/review/${currentLanguageId}`)
        .then(response => response.json())
        .then(data => {
            if (data.review_cards && data.review_cards.length > 0) {
                reviewCards = data.review_cards;
                showCurrentCard();
                updateProgress();
            } else {
                showNoCards();
            }
        })
        .catch(error => {
            console.error('Error loading review cards:', error);
            showNoCards();
        });
}

function showCurrentCard() {
    if (currentCardIndex >= reviewCards.length) {
        showSessionComplete();
        return;
    }

    const card = reviewCards[currentCardIndex];

    // Set the front and back content based on direction
    // Ensure direction is set if not already present (e.g., for newly loaded cards)
    if (!card.direction) {
        // Default to ru_to_en if level < 3, else randomize
        if (card.status < 3) { // Assuming STATUS_LEVEL_3 is 3
            card.direction = 'ru_to_en';
        } else {
            card.direction = Math.random() < 0.5 ? 'ru_to_en' : 'en_to_ru';
        }
    }

    if (card.direction === 'ru_to_en') {
        document.getElementById('term').textContent = card.term;
        document.getElementById('translation').textContent = card.translation;
    } else {
        document.getElementById('term').textContent = card.translation;
        document.getElementById('translation').textContent = card.term;
    }

    document.getElementById('context').textContent = card.context_sentence || '';
    // Display custom status as "Level: X"
    document.getElementById('card-level').textContent = card.status; 

    // Reset card state
    document.getElementById('back').classList.add('d-none');
    document.getElementById('show-answer').classList.remove('d-none');
    document.getElementById('rating-buttons').classList.add('d-none');

    // Hide feedback message for new card
    const feedbackDiv = document.getElementById('review-feedback');
    feedbackDiv.style.opacity = 0;
    feedbackDiv.textContent = '';
}

function rateCard(rating) {
    cardHistory.push(currentCardIndex);
    const card = reviewCards[currentCardIndex];
    const oldStatus = card.status; // Capture old status before update

    fetch('/api/review/update', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                term_id: card.id,
                rating: rating,
                direction: card.direction // Send current direction to backend
            })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                const feedbackDiv = document.getElementById('review-feedback');
                let message = '';
                const newStatus = data.new_status;
                card.status = newStatus; // Update frontend card object with new status

                if (rating === 'easy') {
                    message = 'Now known';
                } else if (rating === 'good') {
                    message = `Advanced to Level ${newStatus}`;
                } else if (rating === 'hard') {
                    message = 'No level change';
                } else if (rating === 'again') {
                    if (newStatus < oldStatus) { // Level decreased
                        message = `Level decreased to Level ${newStatus}`;
                    } else {
                        message = 'No level change';
                    }
                }

                feedbackDiv.textContent = message;
                feedbackDiv.style.opacity = 1; // Show message
                setTimeout(() => {
                    feedbackDiv.style.opacity = 0; // Fade out after 1 second
                }, 1000); // 1000 milliseconds = 1 second

                // Update global vocab cache for reader consistency
                // Assuming term and translation are available from the card object
                updateTermDetails(card.term, { 
                    status: newStatus, 
                    translation: card.translation 
                });

                currentCardIndex++;
                updateProgress();
                showCurrentCard();
            } else {
                console.error('Error updating card:', data.error);
            }
        })
        .catch(error => {
            console.error('Error rating card:', error);
        });
}

function updateProgress() {
    const progress = (currentCardIndex / reviewCards.length) * 100;
    document.getElementById('progress-bar').style.width = `${progress}%`;
    document.getElementById('progress-text').textContent = `${currentCardIndex}/${reviewCards.length}`;
}

function showNoCards() {
    document.getElementById('review-area').classList.add('d-none');
    document.getElementById('no-cards').classList.remove('d-none');
}

function showSessionComplete() {
    document.getElementById('review-area').classList.add('d-none');
    document.getElementById('session-complete').classList.remove('d-none');
}

function goBackToLastCard() {
    if (cardHistory.length > 0) {
        currentCardIndex = cardHistory.pop();
        showCurrentCard();
        updateProgress();
    }
}

function showAnswer() {
    document.getElementById('back').classList.remove('d-none');
    document.getElementById('show-answer').classList.add('d-none');
    document.getElementById('rating-buttons').classList.remove('d-none');
}

// --- Media Player General Helpers ---
function getCurrentPlayer() {
    if (window.player && typeof window.player.getCurrentTime === 'function') {
        return window.player;
    } else if (html5Player && typeof html5Player.currentTime !== 'undefined') {
        return html5Player;
    }
    return null;
}

function getCurrentPlayerTime() {
    const player = getCurrentPlayer();
    if (player) {
        try {
            const isYoutube = player === window.player;
            const time = isYoutube ? player.getCurrentTime() : player.currentTime;
            
            // Debug logging
            if (isYoutube) {
                console.log('YouTube player time:', time, 
                            'Player state:', player.getPlayerState ? 
                                getPlayerStateName(player.getPlayerState()) : 'N/A',
                            'Player ready:', !!player.getDuration);
            } else {
                console.log('HTML5 player time:', time, 
                          'Paused:', player.paused, 
                          'ReadyState:', player.readyState);
            }
            
            return time;
        } catch (error) {
            console.error('Error getting player time:', error);
            return 0;
        }
    }
    console.warn('No active player found');
    return 0;
}

// Helper function to convert YouTube player state to string
function getPlayerStateName(state) {
    const states = {
        [-1]: 'UNSTARTED',
        0: 'ENDED',
        1: 'PLAYING',
        2: 'PAUSED',
        3: 'BUFFERING',
        5: 'VIDEO_CUED'
    };
    return states[state] || `UNKNOWN (${state})`;
}

function getCurrentPlayerDuration() {
    const player = getCurrentPlayer();
    if (player) {
        return (player === window.player) ? player.getDuration() : player.duration;
    }
    return 0;
}

function seekPlayerTo(time) {
    const player = getCurrentPlayer();
    if (player) {
        if (player === window.player) {
            player.seekTo(time, true);
        } else {
            player.currentTime = time;
        }
    }
}