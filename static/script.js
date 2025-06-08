// Define word status constants
const STATUS_UNKNOWN = 0;  // Blue Highlight
const STATUS_LEVEL_1 = 1;  // Red
const STATUS_LEVEL_2 = 2;  // Orange
const STATUS_LEVEL_3 = 3;  // Yellow
const STATUS_LEVEL_4 = 4;  // Light Green
const STATUS_LEVEL_5 = 5;  // Green
const STATUS_KNOWN = 6;    // Known (no highlight)
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
let currentLessonId = null;
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

// --- Video Sync Functions ---
let timestamps = null;

// --- Repeat Functionality Variables ---
let currentRepeatMode = null; // 'page', 'sentence', or null
let repeatLoopInterval = null;
let repeatLoopStartTime = 0;
let repeatLoopEndTime = 0;

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    console.log("Reader loaded.");
    initializeReader();
    initializeMediaPlayer();
    initializeEditorButtons(); // Add this call
    createTooltipElement(); // Create tooltip div on initialization
    initializeRepeatControls(); // NEW: Initialize repeat buttons
});

function initializeReader() {
    console.log("Initializing Reader...");

    // Get lesson and language IDs from the data attributes
    const appContainer = document.querySelector('.app-container');
    if (!appContainer) {
        console.error("App container not found.");
        return; // Cannot initialize without the container
    }
    currentLanguageId = appContainer.dataset.languageId;

    const textContainer = document.getElementById('text-container');
    if (!textContainer) {
        console.error("Text container not found.");
        return; // Cannot initialize without the container
    }
    currentLessonId = textContainer.dataset.lessonId;
    const rawText = textContainer.dataset.rawText;

    if (!currentLanguageId || !currentLessonId || !rawText) {
        console.error("Missing required data attributes on app or text container.");
        return; // Cannot proceed without essential data
    }

    const parsedTextArea = document.getElementById('parsed-text-area');
    if (!parsedTextArea) {
         console.error("Parsed text area not found.");
         return; // Cannot proceed without the render target
    }

    // --- 1. Parse Text ---
    allParsedElements = parseText(rawText); // Store the full parsed list globally
    console.log("Text parsed.", allParsedElements);

    // NEW DEBUG: Count actual paragraphs based on newlines in rawText
    const rawTextParagraphs = rawText.split('\n').filter(line => line.trim() !== '').length;
    console.log("DEBUG: Raw text paragraphs count (based on newlines):", rawTextParagraphs);

    // --- 2. Identify Unique Terms ---
    const uniqueSingleTerms = [...new Set(allParsedElements.filter(p => p.type === 'word').map(p => p.term.toLowerCase()))];
    console.log("Unique single terms identified.", uniqueSingleTerms);

    // --- 3. Fetch Vocab Status (Single & Multi-word) --- 
    console.log("Fetching vocab status and multiword terms...");
    Promise.all([
        fetchVocabStatus(currentLanguageId, uniqueSingleTerms),
        fetchMultiwordTerms(currentLanguageId)
    ])
    .then(([singleWordVocab, multiwordTerms]) => {
        vocabCache = singleWordVocab; // Store fetched single word statuses
        multiwordTermsCache = multiwordTerms; // Store multi-word terms
        console.log("Vocab status and multiword terms fetched.");
        
        // Initialize video sync if timestamps exist - IMPORTANT: Call BEFORE pagination setup
        console.log("Initializing video sync...");
        initializeVideoSync(); // This populates 'timestamps' global variable

        // NEW DEBUG: Log timestamps array and its length after it's populated
        console.log("DEBUG: Initialized timestamps array:", timestamps);
        console.log("DEBUG: timestamps.length:", timestamps ? timestamps.length : 'null');
        
        // --- Setup Pagination if needed ---
        // Now use allParsedElements for pagination setup
        const needsPagination = allParsedElements.length > ELEMENTS_PER_PAGE;
        if (needsPagination) {
            console.log("Setting up pagination.");
            setupPagination(allParsedElements); // Pass the full list
        } else {
            console.log("No pagination needed.");
            pagedElements = [allParsedElements]; // Treat as a single page
            pageInfo = [{ firstGlobalParagraphIndex: 0 }]; // Add default pageInfo
            totalPages = 1;
        }
        
        // --- Initial Render (Page 1) ---
        console.log("Rendering initial page.", currentPage);
        renderPage(currentPage); 

    })
    .catch(error => {
        console.error("Error fetching vocab status or multiword terms:", error);
        parsedTextArea.innerHTML = '<p><i>Error loading data. Displaying plain text.</i></p>'; 
    });
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
            elements.push({ type: 'word', term: match[1] });
        } else if (match[2]) { // Group 2 matched: Non-word characters (separators)
            elements.push({ type: 'separator', text: match[2] });
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
        body: JSON.stringify({ terms: termsList }),
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

function buildStyledParagraphHtml(elements, singleWordVocab, multiwordTerms) {
    let html = '';
    let i = 0;
    while (i < elements.length) {
        const currentElement = elements[i];
        let multiwordMatch = null;
        if (currentElement.type === 'word') {
            for (const mwTermData of multiwordTerms) {
                const mwTerm = mwTermData.term;
                let textSlice = '';
                let elementsConsumed = [];
                let tempIndex = i;
                while(tempIndex < elements.length && textSlice.length < mwTerm.length + 5) {
                    elementsConsumed.push(elements[tempIndex]);
                    textSlice += elements[tempIndex].text || elements[tempIndex].term;
                    tempIndex++;
                    if (textSlice.length > mwTerm.length && !textSlice.toLowerCase().startsWith(mwTerm.toLowerCase())) break; 
                }
                const normalizedTextSlice = textSlice.replace(/\s+/g, ' ').trim();
                if (normalizedTextSlice.toLowerCase().startsWith(mwTerm.toLowerCase())) {
                     const potentialMatch = normalizedTextSlice.substring(0, mwTerm.length);
                     if (potentialMatch.toLowerCase() === mwTerm.toLowerCase()) {
                         let matchedElements = [];
                         let matchedTextLength = 0;
                         let elemIdx = i;
                         let currentMatchedText = '';
                        while(elemIdx < elements.length) {
                            const elem = elements[elemIdx];
                             const elemText = elem.text || elem.term;
                             const nextText = currentMatchedText + elemText;
                             if (mwTerm.toLowerCase().startsWith(nextText.replace(/\s+/g, ' ').trim().toLowerCase())) {
                                 matchedElements.push(elem);
                                 currentMatchedText += elemText;
                                 matchedTextLength++;
                                 elemIdx++;
                                 if (currentMatchedText.replace(/\s+/g, ' ').trim().toLowerCase() === mwTerm.toLowerCase()) {
                                     break; 
                                 }
                             } else {
                                break;
                             }
                         }
                         if (currentMatchedText.replace(/\s+/g, ' ').trim().toLowerCase() === mwTerm.toLowerCase()) {
                             multiwordMatch = {
                                 termData: mwTermData,
                                 elements: matchedElements,
                                 length: matchedTextLength
                             };
                            break;
                         }
                     }
                }
            }
        }
        if (multiwordMatch) {
            const termData = multiwordMatch.termData;
            const statusClass = getStatusClass(termData.status);
            const combinedText = multiwordMatch.elements.map(el => el.text || el.term).join('');
            const translation = termData.translation || '';
            html += `<span class="word ${statusClass}" data-term="${escapeHtml(termData.term)}" data-status="${termData.status}" data-translation="${escapeHtml(translation)}">${escapeHtml(combinedText)}</span>`;
            i += multiwordMatch.length;
        } else if (currentElement.type === 'word') {
            const lowerTerm = currentElement.term.toLowerCase();
            const statusInfo = singleWordVocab[lowerTerm] || { status: 0, translation: null };
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
    console.log("YouTube player ready.");
    // Removed: Enable timestamp clicks (now handled by attachTimestampClickListeners in renderPage)
    // document.querySelectorAll('.timestamp-badge').forEach(badge => {
    //     badge.addEventListener('click', function(e) {
    //         e.preventDefault();
    //         e.stopPropagation();
    //         const ts = parseInt(this.dataset.timestamp, 10);
    //         if (!isNaN(ts) && window.player) {
    //             window.player.seekTo(ts, true);
    //             window.player.playVideo();
    //         }
    //     });
    // });
}

function onPlayerStateChange(event) {
    if (event.data === YT.PlayerState.PLAYING) {
        startVideoSync();
    } else if (event.data === YT.PlayerState.PAUSED || event.data === YT.PlayerState.ENDED) {
        stopVideoSync();
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
                    updateTermDetails(currentEditorTerm, { status: newStatus });
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
                 
                 updateTermDetails(currentEditorTerm, { 
                     translation: translation, 
                     // Status only needs to be sent if we are forcing it (e.g. from Unknown to 1)
                     // The backend handles the auto-level-1 logic based on current DB status
                     // Send current status just for backend context if needed for auto-logic.
                     // status: currentStatus // (Optional: let backend figure it out)
                 });
            }
        });
    }
}

// --- Update Term Status/Translation via API ---
async function updateTermDetails(term, { status, translation }) {
    if (!term || !currentLanguageId) return;
    
    console.log(`Updating term: ${term}`, { status, translation });

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
        vocabCache[lowerTerm] = {
            status: data.status || status,
            translation: data.translation || translation
        };

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
    // If the final range is collapsed, ignore (was likely a click)
    if (range.collapsed) {
        return; 
    }
    
    // If the snapped selection is just a single word span, ignore
    const containedNodes = range.cloneContents().querySelectorAll('.word');
    const firstNode = range.startContainer.nodeType === Node.ELEMENT_NODE ? range.startContainer : range.startContainer.parentElement;
    if (containedNodes.length <= 1 && firstNode.classList?.contains('word') && firstNode.textContent === selectedText) {
         return; 
    }

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
            pageInfo.push({ firstGlobalParagraphIndex: currentPageStartIndex });
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
        pageInfo.push({ firstGlobalParagraphIndex: currentPageStartIndex });
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
                    parsedTextArea.scrollTo({ top: 0, behavior: 'instant' });
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
                    parsedTextArea.scrollTo({ top: 0, behavior: 'instant' });
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
            e.preventDefault();  // Prevent default button action (if any)
            
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
                    body: JSON.stringify({ position: position })
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
                    if(data.success) {
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
    currentPage = pageNumber;

    // Stop any active repeat loop when page changes
    if (repeatLoopInterval) {
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
    if (timestamps && Array.isArray(timestamps) && timestamps.length > 0) {
        // Pass the globalParagraphOffset to buildStyledHtmlWithTimestamps
        styledHtml = buildStyledHtmlWithTimestamps(elementsToRender, vocabCache, multiwordTermsCache, timestamps, globalParagraphOffset);
    } else {
        styledHtml = buildStyledHtml(elementsToRender, vocabCache, multiwordTermsCache);
    }
    if (parsedTextArea) {
        parsedTextArea.innerHTML = styledHtml;
        addWordClickListeners();
        // Call new function to attach timestamp click listeners
        attachTimestampClickListeners();
        
        // Reset scroll positions of all containers
        parsedTextArea.scrollTop = 0;
        if (textContainer) textContainer.scrollTop = 0;
        if (leftPane) leftPane.scrollTop = 0;
    } else {
        console.error("#parsed-text-area not found during renderPage");
    }
    updatePaginationUI();
}

// --- NEW: Attach Timestamp Click Listeners (Centralized) ---
function attachTimestampClickListeners() {
    document.querySelectorAll('.timestamp-badge').forEach(badge => {
        badge.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            const ts = parseInt(this.dataset.timestamp, 10);
            if (!isNaN(ts) && window.player) {
                // If sentence repeat is active, update the loop target
                if (currentRepeatMode === 'sentence') {
                    const clickedParagraph = this.closest('.lesson-paragraph');
                    if (clickedParagraph && clickedParagraph.dataset.timestamp) {
                        const paragraphStartTime = parseInt(clickedParagraph.dataset.timestamp, 10);
                        
                        // Find the global index of the clicked paragraph
                        const paragraphsOnPage = Array.from(document.querySelectorAll('.lesson-paragraph'));
                        const clickedParagraphIndexInPage = paragraphsOnPage.indexOf(clickedParagraph);
                        
                        // Get the global paragraph offset for the current page
                        const currentPageInfo = pageInfo[currentPage - 1];
                        const globalParagraphOffset = currentPageInfo ? currentPageInfo.firstGlobalParagraphIndex : 0;

                        const clickedParagraphGlobalIndex = globalParagraphOffset + clickedParagraphIndexInPage;
                        
                        let paragraphEndTime;

                        // If there is a next global timestamp, use it as the end time
                        if (clickedParagraphGlobalIndex + 1 < timestamps.length) {
                            paragraphEndTime = timestamps[clickedParagraphGlobalIndex + 1].timestamp;
                        } else {
                            // NEW LOGIC: If it's the last timestamp but NOT the last actual paragraph in the text,
                            // set end time to current start + a short buffer.
                            // This handles cases where the last text paragraph doesn't have a timestamp.
                            const totalTextParagraphs = allParsedElements.filter(el => el.type === 'separator' && el.text.includes('\n')).length + 1; // Approx paragraph count
                            if (clickedParagraphGlobalIndex < totalTextParagraphs - 1) {
                                // It's the last timestamped paragraph, but not the last actual paragraph of text
                                paragraphEndTime = paragraphStartTime + 5; // Loop for 5 seconds (heuristic)
                            } else {
                                // It's genuinely the last paragraph of the entire text
                                paragraphEndTime = window.player.getDuration();
                            }
                        }

                        // Re-trigger toggleRepeatMode with new boundaries, it will update the loop
                        toggleRepeatMode('sentence', paragraphStartTime, paragraphEndTime);
                        window.player.seekTo(paragraphStartTime, true); // Seek to new sentence start immediately
                        window.player.playVideo(); // Ensure playback starts
                        return; // Exit as repeat mode is handled
                    }
                }
                // Original behavior: seek and play if not in sentence repeat mode
                window.player.seekTo(ts, true);
                window.player.playVideo(); // Optionally play video on seek
            }
        });
    });
}

// --- Video Sync Functions ---
function initializeVideoSync() {
    console.log("initializeVideoSync started.");
    
    // Get timestamps from the new script tag
    const timestampsScriptTag = document.getElementById('timestamps-data');
    let timestampsJson = null;

    if (timestampsScriptTag) {
        timestampsJson = timestampsScriptTag.textContent;
        console.log("initializeVideoSync: raw timestampsJson from script tag:", timestampsJson);
    } else {
        console.error("initializeVideoSync: timestamps-data script tag not found.");
    }

    if (timestampsJson && timestampsJson.trim() !== '' && timestampsJson.trim().toLowerCase() !== 'null') {
        try {
            timestamps = JSON.parse(timestampsJson);
            console.log("initializeVideoSync: Loaded timestamps successfully:", timestamps);
            
            // Initialize YouTube player if URL exists
            const videoContainer = document.getElementById('video-player-container');
            if (videoContainer) {
                const youtubeUrl = videoContainer.dataset.youtubeUrl;
                console.log("initializeVideoSync: youtubeUrl data attribute value:", youtubeUrl);
                if (youtubeUrl) {
                    const videoId = extractYouTubeId(youtubeUrl);
                    console.log("initializeVideoSync: Extracted YouTube ID:", videoId);
                    if (videoId) {
                        // Load YouTube IFrame API
                        console.log("initializeVideoSync: Loading YouTube IFrame API.");
                        const tag = document.createElement('script');
                        tag.src = "https://www.youtube.com/iframe_api";
                        const firstScriptTag = document.getElementsByTagName('script')[0];
                        firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
                        
                        // Create player when API is ready
                        window.onYouTubeIframeAPIReady = function() {
                            console.log("YouTube IFrame API Ready. Creating player.");
                            window.player = new YT.Player('video-player-container', {
                                height: '360',
                                width: '640',
                                videoId: videoId,
                                playerVars: {
                                    'playsinline': 1
                                },
                                events: {
                                    'onReady': onPlayerReady,
                                    'onStateChange': onPlayerStateChange
                                }
                            });
                        };
                    } else {
                         console.log("initializeVideoSync: Could not extract YouTube ID from URL:", youtubeUrl);
                    }
                } else {
                     console.log("initializeVideoSync: No youtubeUrl data attribute found.");
                }
            } else {
                 console.error("initializeVideoSync: video-player-container not found.");
            }
        } catch (e) {
            console.error("initializeVideoSync: Error parsing timestamps JSON:", e, "JSON string:", timestampsJson);
            timestamps = null; // Ensure timestamps is null on error
        }
    } else {
        console.log("initializeVideoSync: No timestamps data found or it is null.");
    }
}

function onPlayerReady(event) {
    console.log("YouTube player ready.");
    // Removed: Enable timestamp clicks (now handled by attachTimestampClickListeners in renderPage)
    // document.querySelectorAll('.timestamp-badge').forEach(badge => {
    //     badge.addEventListener('click', function(e) {
    //         e.preventDefault();
    //         e.stopPropagation();
    //         const ts = parseInt(this.dataset.timestamp, 10);
    //         if (!isNaN(ts) && window.player) {
    //             window.player.seekTo(ts, true);
    //             window.player.playVideo();
    //         }
    //     });
    // });
}

function onPlayerStateChange(event) {
    if (event.data === YT.PlayerState.PLAYING) {
        startVideoSync();
    } else if (event.data === YT.PlayerState.PAUSED || event.data === YT.PlayerState.ENDED) {
        stopVideoSync();
    }
}

let syncInterval = null;

function startVideoSync() {
    if (syncInterval) return;
    syncInterval = setInterval(() => {
        if (window.player) {
            const currentTime = window.player.getCurrentTime();
            updateCurrentSegment(currentTime);
        }
    }, 100); // Update every 100ms
}

function stopVideoSync() {
    if (syncInterval) {
        clearInterval(syncInterval);
        syncInterval = null;
    }
}

function updateCurrentSegment(time) {
    // If ANY repeat mode is active, this function will primarily focus on highlighting
    // and will NOT trigger page changes. The repeat loop handles video seeking.
    if (currentRepeatMode) {
        // Find current segment (global paragraph index) based on time
        let currentSegmentGlobalIndex = -1;
        for (let i = 0; i < timestamps.length; i++) {
            if (timestamps[i].timestamp > time) {
                break;
            }
            currentSegmentGlobalIndex = i;
        }

        if (currentSegmentGlobalIndex === -1) {
            return; // No segment found yet (e.g., video is before first timestamp)
        }

        // Get the global paragraph offset for the current page
        const currentPageInfo = pageInfo[currentPage - 1];
        const globalParagraphOffset = currentPageInfo ? currentPageInfo.firstGlobalParagraphIndex : 0;

        // Calculate the relative index of the paragraph on the current page
        const relativeParagraphIndex = currentSegmentGlobalIndex - globalParagraphOffset;

        // Only highlight if the segment is on the current page and visible
        if (relativeParagraphIndex >= 0 && relativeParagraphIndex < (pagedElements[currentPage - 1] || []).length) {
            document.querySelectorAll('.lesson-paragraph').forEach(p => {
                p.classList.remove('current-segment');
            });
            const paragraphs = document.querySelectorAll('.lesson-paragraph');
            if (paragraphs[relativeParagraphIndex]) {
                const elementToHighlight = paragraphs[relativeParagraphIndex];
                elementToHighlight.classList.add('current-segment');

                // Only scroll if the element is not fully in view within the parsed-text-area
                // and it's NOT in sentence repeat mode (as sentence mode fixes view)
                if (currentRepeatMode !== 'sentence') {
                    const rect = elementToHighlight.getBoundingClientRect();
                    const parsedTextArea = document.getElementById('parsed-text-area');
                    if (parsedTextArea) {
                        const parentRect = parsedTextArea.getBoundingClientRect();
                        const isOutsideView = (rect.top < parentRect.top || rect.bottom > parentRect.bottom);
                        if (isOutsideView) {
                            elementToHighlight.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        }
                    }
                }
            }
        }
        return; // Always return here if any repeat mode is active, preventing any page changes.
    }

    // --- This section only runs if no repeat mode is active (currentRepeatMode is null) ---

    if (!timestamps || !Array.isArray(timestamps) || timestamps.length === 0) {
        return;
    }

    // Find current segment (global paragraph index) based on time
    let currentSegmentGlobalIndex = -1;
    for (let i = 0; i < timestamps.length; i++) {
        if (timestamps[i].timestamp > time) {
            break;
        }
        currentSegmentGlobalIndex = i;
    }

    if (currentSegmentGlobalIndex === -1) {
        // No segment found yet (e.g., video is before first timestamp), no action needed
        return;
    }

    // Determine which page this global segment belongs to
    let targetPage = currentPage; // Default to current page
    let firstParagraphGlobalIndexOnTargetPage = 0; // To store the start of the target page
    let foundPage = false;

    for (let i = 0; i < pageInfo.length; i++) {
        const pageStartGlobalIndex = pageInfo[i].firstGlobalParagraphIndex;
        const nextPageStartGlobalIndex = (i + 1 < pageInfo.length) ? pageInfo[i+1].firstGlobalParagraphIndex : Infinity;

        if (currentSegmentGlobalIndex >= pageStartGlobalIndex && currentSegmentGlobalIndex < nextPageStartGlobalIndex) {
            targetPage = i + 1; // Page numbers are 1-indexed
            firstParagraphGlobalIndexOnTargetPage = pageStartGlobalIndex;
            foundPage = true;
            break;
        }
    }

    if (!foundPage) {
        console.warn("updateCurrentSegment: Could not find a page for global segment index:", currentSegmentGlobalIndex);
        return;
    }

    // If the target page is different from the current page, render the new page
    // This logic only executes when currentRepeatMode is null (no repeat active)
    if (targetPage !== currentPage) {
        console.log(`Switching page: video time ${time}s, global segment ${currentSegmentGlobalIndex} triggers page ${targetPage}.`);
        const parsedTextArea = document.getElementById('parsed-text-area');
        if (parsedTextArea) {
            parsedTextArea.scrollTop = 0; // Scroll to top before page change
        }
        renderPage(targetPage);
        return; // Exit here, let next interval handle highlighting on new page
    }

    // If we are on the correct page (and no repeat mode is active), proceed with highlighting and scrolling
    // Remove highlight from all paragraphs
    document.querySelectorAll('.lesson-paragraph').forEach(p => {
        p.classList.remove('current-segment');
    });
    
    // Calculate the relative index of the paragraph on the current page
    const relativeParagraphIndex = currentSegmentGlobalIndex - firstParagraphGlobalIndexOnTargetPage;
    
    const paragraphs = document.querySelectorAll('.lesson-paragraph');
    if (paragraphs[relativeParagraphIndex]) {
        const elementToHighlight = paragraphs[relativeParagraphIndex];
        elementToHighlight.classList.add('current-segment');

        // Only scroll if the element is not fully in view within the parsed-text-area
        const rect = elementToHighlight.getBoundingClientRect();
        const parsedTextArea = document.getElementById('parsed-text-area');
        if (parsedTextArea) {
            const parentRect = parsedTextArea.getBoundingClientRect();

            const isOutsideView = (rect.top < parentRect.top || rect.bottom > parentRect.bottom);
            
            if (isOutsideView) {
                elementToHighlight.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }
    }
}

function buildStyledHtml(parsedElements, singleWordVocab, multiwordTerms) {
    // Fallback: just call the new paragraph-based function with no timestamps
    return buildStyledHtmlWithTimestamps(parsedElements, singleWordVocab, multiwordTerms, null);
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
                let paragraphEndTime = window.player.getDuration(); // Default to end of video

                if (currentIndex !== -1 && currentIndex + 1 < paragraphsOnPage.length) {
                    const nextParagraph = paragraphsOnPage[currentIndex + 1];
                    if (nextParagraph.dataset.timestamp) {
                        paragraphEndTime = parseInt(nextParagraph.dataset.timestamp, 10);
                    }
                }
                toggleRepeatMode('sentence', paragraphStartTime, paragraphEndTime);
            } else if (timestamps && timestamps.length > 0) {
                // Fallback: If no sentence is selected, repeat the first one on the current page.
                const firstParagraphElement = document.querySelector('.lesson-paragraph');
                if (firstParagraphElement && firstParagraphElement.dataset.timestamp) {
                    const firstSentenceStartTime = parseInt(firstParagraphElement.dataset.timestamp, 10);
                    const paragraphsOnPage = Array.from(document.querySelectorAll('.lesson-paragraph'));
                    let firstSentenceEndTime = window.player.getDuration();
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
    if (!window.player || !timestamps) {
        console.warn("Player not ready or timestamps not loaded for repeat mode.");
        return;
    }

    // Stop any existing loop
    if (repeatLoopInterval) {
        clearInterval(repeatLoopInterval);
        repeatLoopInterval = null;
        // Remove highlighting from repeat-related buttons
        document.querySelectorAll('#pagination-controls button').forEach(btn => {
            btn.classList.remove('active-repeat');
        });
        if (currentRepeatMode) {
            document.getElementById(`repeat-${currentRepeatMode}-btn`).classList.remove('active-repeat');
        }
    }

    // If the same mode is clicked again, it means stop
    if (currentRepeatMode === mode) {
        currentRepeatMode = null;
        console.log("Repeat mode stopped.");
        return;
    }

    // Set new mode
    currentRepeatMode = mode;
    console.log(`Starting repeat mode: ${mode}`);

    // Highlight the active button
    document.getElementById(`repeat-${mode}-btn`).classList.add('active-repeat');

    if (mode === 'page') {
        const currentPageInfo = pageInfo[currentPage - 1];
        const firstParagraphGlobalIndexOnPage = currentPageInfo ? currentPageInfo.firstGlobalParagraphIndex : 0;
        const firstParagraphElement = document.querySelector('.lesson-paragraph[data-timestamp]');
        
        if (!firstParagraphElement || !firstParagraphElement.dataset.timestamp) {
            console.warn("No timestamped paragraphs found on the current page for page repeat.");
            currentRepeatMode = null;
            return;
        }

        repeatLoopStartTime = parseInt(firstParagraphElement.dataset.timestamp, 10);

        // Find the end time for the page repeat
        const nextPageInfo = pageInfo[currentPage]; // pageInfo is 0-indexed, currentPage is 1-indexed
        if (nextPageInfo) {
            repeatLoopEndTime = timestamps[nextPageInfo.firstGlobalParagraphIndex].timestamp;
        } else {
            // Last page, repeat until end of video
            repeatLoopEndTime = window.player.getDuration();
        }
        // Add 0.5 second buffer, but don't exceed video duration
        repeatLoopEndTime = Math.min(repeatLoopEndTime + 0.5, window.player.getDuration());
        console.log(`Page Repeat Calculated: Start=${repeatLoopStartTime}, End=${repeatLoopEndTime}`);

    } else if (mode === 'sentence') {
        // Use passed startTime and endTime, or try to determine from highlighted sentence
        if (startTime !== null && endTime !== null) {
            repeatLoopStartTime = startTime;
            repeatLoopEndTime = endTime;
        } else {
            // Fallback: Try to find a selected sentence to repeat
            const selectedParagraph = document.querySelector('.lesson-paragraph.current-segment');
            if (selectedParagraph && selectedParagraph.dataset.timestamp) {
                repeatLoopStartTime = parseInt(selectedParagraph.dataset.timestamp, 10);
                
                // Find the global index of the selected paragraph
                const paragraphsOnPage = Array.from(document.querySelectorAll('.lesson-paragraph'));
                const selectedParagraphIndexInPage = paragraphsOnPage.indexOf(selectedParagraph);

                const currentPageInfo = pageInfo[currentPage - 1];
                const globalParagraphOffset = currentPageInfo ? currentPageInfo.firstGlobalParagraphIndex : 0;

                const selectedParagraphGlobalIndex = globalParagraphOffset + selectedParagraphIndexInPage;

                let paragraphEndTime;
                // If there is a next global timestamp, use it as the end time
                if (selectedParagraphGlobalIndex + 1 < timestamps.length) {
                    paragraphEndTime = timestamps[selectedParagraphGlobalIndex + 1].timestamp;
                } else {
                    // NEW LOGIC: If it's the last timestamp but NOT the last actual paragraph in the text,
                    // set end time to current start + a short buffer.
                    // This handles cases where the last text paragraph doesn't have a timestamp.
                    const totalTextParagraphs = allParsedElements.filter(el => el.type === 'separator' && el.text.includes('\n')).length + 1; // Approx paragraph count
                    if (selectedParagraphGlobalIndex < totalTextParagraphs - 1) {
                        // It's the last timestamped paragraph, but not the last actual paragraph of text
                        paragraphEndTime = repeatLoopStartTime + 5; // Loop for 5 seconds (heuristic)
                    } else {
                        // It's genuinely the last paragraph of the entire text
                        paragraphEndTime = window.player.getDuration();
                    }
                }
                repeatLoopEndTime = paragraphEndTime;

            } else {
                console.warn("No specific sentence selected for repeat. Please click a sentence first.");
                currentRepeatMode = null;
                document.getElementById(`repeat-${mode}-btn`).classList.remove('active-repeat');
                return;
            }
        }
        // Add 0.5 second buffer, but don't exceed video duration
        repeatLoopEndTime = Math.min(repeatLoopEndTime + 0.5, window.player.getDuration());
        console.log(`Sentence Repeat Calculated: Start=${repeatLoopStartTime}, End=${repeatLoopEndTime}`);
    }

    console.log(`Repeat loop set: Start=${repeatLoopStartTime}, End=${repeatLoopEndTime}`);

    // Start the interval to check playback position
    repeatLoopInterval = setInterval(() => {
        if (window.player) {
            const currentTime = window.player.getCurrentTime();
            if (currentTime >= repeatLoopEndTime) {
                window.player.seekTo(repeatLoopStartTime, true);
                // Ensure it plays if it was paused exactly at the end
                if (window.player.getPlayerState() !== YT.PlayerState.PLAYING) {
                    window.player.playVideo();
                }
            }
        }
    }, 100); // Check every 100ms
} 