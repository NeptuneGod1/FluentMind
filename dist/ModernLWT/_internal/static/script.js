// Define word status constants
const STATUS_UNKNOWN = 0;  // LingQ Blue Highlight
const STATUS_LEVEL_1 = 1;  // LingQ Red
const STATUS_LEVEL_2 = 2;  // LingQ Orange
const STATUS_LEVEL_3 = 3;  // LingQ Yellow
const STATUS_LEVEL_4 = 4;  // LingQ Light Green
const STATUS_LEVEL_5 = 5;  // LingQ Green
const STATUS_KNOWN = 6;    // LingQ Known (no highlight)
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
let pagedElements = [];
const ELEMENTS_PER_PAGE = 300; // Adjust this number as needed

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    console.log("Reader loaded.");
    initializeReader();
    initializeMediaPlayer();
    initializeEditorButtons(); // Add this call
    createTooltipElement(); // Create tooltip div on initialization
});

function initializeReader() {
    const appContainer = document.querySelector('.app-container'); // In index.html
    const textContainer = document.getElementById('text-container');
    const parsedTextArea = document.getElementById('parsed-text-area');

    if (!appContainer || !textContainer || !parsedTextArea) {
        console.error("Required reader elements not found.");
        return;
    }

    currentLanguageId = appContainer.dataset.languageId;
    currentLessonId = textContainer.dataset.lessonId;

    // Add listener for text selection
    if (parsedTextArea) {
        parsedTextArea.addEventListener('mouseup', handleTextSelection);
    }

    // --- 1. Get Raw Text --- 
    // Get text from the data attribute on #text-container
    const rawText = textContainer.dataset.rawText;

    if (!rawText) {
        parsedTextArea.innerHTML = '<p><i>Error: Could not load lesson text.</i></p>';
        console.error("Raw text not found in data attribute or empty."); // Updated error message
        return;
    }

    // --- 2. Parse Text --- 
    const parsedElements = parseText(rawText);
    const uniqueSingleTerms = [...new Set(parsedElements.filter(p => p.type === 'word').map(p => p.term.toLowerCase()))];

    // --- 3. Fetch Vocab Status (Single & Multi-word) --- 
    Promise.all([
        fetchVocabStatus(currentLanguageId, uniqueSingleTerms),
        fetchMultiwordTerms(currentLanguageId)
    ])
    .then(([singleWordVocab, multiwordTerms]) => {
        vocabCache = singleWordVocab; // Store fetched single word statuses
        multiwordTermsCache = multiwordTerms; // Store multi-word terms
        
        // --- Setup Pagination if needed ---
        const needsPagination = parsedElements.length > ELEMENTS_PER_PAGE;
        if (needsPagination) {
            setupPagination(parsedElements);
        } else {
            pagedElements = [parsedElements]; // Treat as a single page
            totalPages = 1;
        }
        
        // --- Initial Render (Page 1) ---
        renderPage(currentPage); 
        // // Old rendering logic:
        // const styledHtml = buildStyledHtml(parsedElements, vocabCache, multiwordTermsCache);
        // parsedTextArea.innerHTML = styledHtml;
        // addWordClickListeners();
    })
    .catch(error => {
        console.error("Error fetching vocab status or multiword terms:", error);
        // Simplified error handling for now
        parsedTextArea.innerHTML = '<p><i>Error loading data. Displaying plain text.</i></p>'; 
        // Maybe still try to render plain parsed text?
        // const plainHtml = buildStyledHtml(parsedElements, {}, []);
        // parsedTextArea.innerHTML = plainHtml;
        // addWordClickListeners();
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

// --- Build Styled HTML (Needs Major Update for Multi-word) ---
function buildStyledHtml(parsedElements, singleWordVocab, multiwordTerms) {
    let html = '';
    let currentParagraph = '<p class="lesson-paragraph">';
    let i = 0;

    console.log("Building HTML with multiword terms:", multiwordTerms);

    while (i < parsedElements.length) {
        const currentElement = parsedElements[i];
        let multiwordMatch = null;

        if (currentElement.type === 'word') {
            // Check if this word starts any known multi-word term
            for (const mwTermData of multiwordTerms) {
                const mwTerm = mwTermData.term; // Usually lowercase from DB
                // Check if the current text stream starts with this multi-word term
                let textSlice = '';
                let elementsConsumed = [];
                let tempIndex = i;
                while(tempIndex < parsedElements.length && textSlice.length < mwTerm.length + 5) { // Add buffer for case/space diffs
                    elementsConsumed.push(parsedElements[tempIndex]);
                    textSlice += parsedElements[tempIndex].text || parsedElements[tempIndex].term;
                    tempIndex++;
                    // Optimization: break if textSlice is definitely longer and doesn't match
                    if (textSlice.length > mwTerm.length && !textSlice.toLowerCase().startsWith(mwTerm.toLowerCase())) break; 
                }
                
                // Normalize the slice before comparing to handle potential extra spaces in text
                const normalizedTextSlice = textSlice.replace(/\s+/g, ' ').trim();

                // --- Make comparison case-insensitive ---
                // Check if the normalized slice starts with the multi-word term (lowercase)
                if (normalizedTextSlice.toLowerCase().startsWith(mwTerm.toLowerCase())) {
                     // Ensure it's an exact match after normalization (e.g. "word one" matches "word one", not "word one two")
                     const potentialMatch = normalizedTextSlice.substring(0, mwTerm.length);
                     if (potentialMatch.toLowerCase() === mwTerm.toLowerCase()) {
                         // Now, reconstruct the *actual* elements that form this match
                         let matchedElements = [];
                         let matchedTextLength = 0;
                         let elemIdx = i;
                         let currentMatchedText = '';
                         while(elemIdx < parsedElements.length) {
                             const elem = parsedElements[elemIdx];
                             const elemText = elem.text || elem.term;
                             const nextText = currentMatchedText + elemText;
                             // Check if adding the next element still keeps us as a prefix of the target term (case-insensitive)
                             if (mwTerm.toLowerCase().startsWith(nextText.replace(/\s+/g, ' ').trim().toLowerCase())) {
                                 matchedElements.push(elem);
                                 currentMatchedText += elemText;
                                 matchedTextLength++;
                                 elemIdx++;
                                 // If we have an exact match in terms of normalized text, we are done.
                                 if (currentMatchedText.replace(/\s+/g, ' ').trim().toLowerCase() === mwTerm.toLowerCase()) {
                                     break; 
                                 }
                             } else {
                                 break; // Adding the next element breaks the match
                             }
                         }

                         // Verify we actually formed the full term
                         if (currentMatchedText.replace(/\s+/g, ' ').trim().toLowerCase() === mwTerm.toLowerCase()) {
                             multiwordMatch = {
                                 termData: mwTermData,
                                 elements: matchedElements,
                                 length: matchedTextLength
                             };
                             console.log(`Found multi-word match: ${mwTermData.term} consuming ${matchedTextLength} elements.`);
                             break; // Stop checking once the longest match is found
                         }
                     }
                }
            }
        }

        if (multiwordMatch) {
            // --- Render Multi-word Term --- 
            const termData = multiwordMatch.termData;
            const statusClass = getStatusClass(termData.status);
            const combinedText = multiwordMatch.elements.map(el => el.text || el.term).join('');
            const translation = termData.translation || ''; // Get translation
            
            currentParagraph += `<span class="word ${statusClass}" 
                                      data-term="${escapeHtml(termData.term)}" 
                                      data-status="${termData.status}" 
                                      data-translation="${escapeHtml(translation)}"
                                      >${escapeHtml(combinedText)}</span>`; // Display the text as it appeared
            i += multiwordMatch.length; // Skip the consumed elements
        } else if (currentElement.type === 'word') {
            // --- Render Single Word --- 
            const lowerTerm = currentElement.term.toLowerCase();
            const statusInfo = singleWordVocab[lowerTerm] || { status: 0, translation: null }; // Default to unknown
            const statusClass = getStatusClass(statusInfo.status);
            const translation = statusInfo.translation || ''; // Get translation
            currentParagraph += `<span class="word ${statusClass}" 
                                      data-term="${escapeHtml(currentElement.term)}" 
                                      data-status="${statusInfo.status}" 
                                      data-translation="${escapeHtml(translation)}"
                                      >${escapeHtml(currentElement.term)}</span>`;
            i++;
        } else if (currentElement.text.includes('\n')) {
            // --- Handle Newlines --- 
            currentParagraph += '</p>';
            html += currentParagraph;
            currentParagraph = '<p class="lesson-paragraph">';
            const nonNewlinePart = currentElement.text.replace(/\n/g, '');
            if (nonNewlinePart) currentParagraph += `<span>${escapeHtml(nonNewlinePart)}</span>`;
            i++;
        } else {
            // --- Render Separator --- 
            currentParagraph += `<span>${escapeHtml(currentElement.text)}</span>`;
            i++;
        }
    }

    // Add the last paragraph
    currentParagraph += '</p>';
    html += currentParagraph;

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
        console.error("Media player container not found!"); // Added error log
        return; 
    }

    console.log("Initializing media player. YouTube URL:", lessonYoutubeUrl, "Audio URL:", lessonAudioUrl); // Log URLs

    if (lessonYoutubeUrl) { // Checks if lessonYoutubeUrl is truthy (not null, undefined, 0, false, '', NaN)
        // Extract video ID from URL
        const videoId = extractYouTubeId(lessonYoutubeUrl);
        console.log("Extracted YouTube Video ID:", videoId); // Log extracted ID

        if (videoId) {
            playerContainer.innerHTML = `
                <iframe width="100%" height="100%" 
                        src="https://www.youtube.com/embed/${videoId}" 
                        title="YouTube video player" frameborder="0" 
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
                        allowfullscreen></iframe>`;
            console.log("YouTube player embedded."); // Log success
        } else {
             playerContainer.innerHTML = '<p><i>Invalid YouTube URL format. Could not extract Video ID.</i></p>'; // More specific error
             console.warn("Could not extract Video ID from URL:", lessonYoutubeUrl); // Log warning
        }
    } else if (lessonAudioUrl) { // Checks if lessonAudioUrl is truthy
        playerContainer.innerHTML = `
            <audio controls style="width: 100%;">
                <source src="${lessonAudioUrl}" type="audio/mpeg"> <!-- Adjust type if needed -->
                Your browser does not support the audio element.
            </audio>`;
        console.log("Audio player embedded."); // Log success
    } else {
        playerContainer.innerHTML = '<p><i>No media provided for this lesson.</i></p>';
        console.log("No valid YouTube or Audio URL found."); // Log reason
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
            const termText = selectedWordSpan.textContent || term; // Use span text, fallback to term data
            
            // Find the first occurrence of the term within the paragraph text
            // This might be imprecise if the same word appears multiple times
            const termIndex = paragraphText.indexOf(termText);

            if (termIndex !== -1) {
                // Find the start of the sentence
                let sentenceStart = paragraphText.lastIndexOf('. ', termIndex);
                if (sentenceStart === -1) sentenceStart = paragraphText.lastIndexOf('! ', termIndex);
                if (sentenceStart === -1) sentenceStart = paragraphText.lastIndexOf('? ', termIndex);
                // If no punctuation found before, start from beginning of paragraph
                // Adjust index to be *after* the punctuation and space
                sentenceStart = (sentenceStart === -1) ? 0 : sentenceStart + 2; 

                // Find the end of the sentence
                let sentenceEnd = paragraphText.indexOf('.', termIndex + termText.length);
                let tempEnd = paragraphText.indexOf('!', termIndex + termText.length);
                if (tempEnd !== -1 && (sentenceEnd === -1 || tempEnd < sentenceEnd)) sentenceEnd = tempEnd;
                tempEnd = paragraphText.indexOf('?', termIndex + termText.length);
                if (tempEnd !== -1 && (sentenceEnd === -1 || tempEnd < sentenceEnd)) sentenceEnd = tempEnd;
                
                // If no punctuation found after, go to end of paragraph
                sentenceEnd = (sentenceEnd === -1) ? paragraphText.length : sentenceEnd + 1;

                sentence = paragraphText.substring(sentenceStart, sentenceEnd).trim();
                console.log(`Extracted sentence [${sentenceStart}-${sentenceEnd}]:`, sentence);

                // Sanity check: does the extracted sentence still contain the term?
                // Use case-insensitive check as punctuation splitting might affect casing indirectly
                if (!sentence || sentence.toLowerCase().indexOf(termText.toLowerCase()) === -1) {
                    console.warn("Extracted sentence didn't contain the original term. Falling back to paragraph.");
                    sentence = paragraphText.trim(); // Fallback to whole paragraph if extraction failed
                }
            } else {
                 console.warn("Could not find term index within paragraph. Using full paragraph as context.");
                 sentence = paragraphText.trim(); // Fallback if term not found in paragraph text
            }
        }
    }
    // --- End Find Context ---

    // Prepare data payload
    const payload = { 
        term: term,
        lang_id: currentLanguageId 
    };
    if (status !== undefined) payload.status = status;
    if (translation !== undefined) payload.translation = translation; // Send even if empty string
    if (sentence) payload.sentence = sentence.trim(); // Add sentence to payload if found

    try {
        const response = await fetch('/api/vocab/update', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
        }

        const result = await response.json();
        console.log("API Response Data:", result); // Log the raw response

        // --- Add Checks for Success and Term --- 
        if (!result || !result.success) {
            console.error("Update API call failed or returned invalid data.", result);
            alert("Failed to update term: Invalid response from server.");
            return; // Stop processing
        }
        if (result.term === undefined) {
            console.error("Term is undefined in the successful API response!", result);
            alert("Failed to update term: Missing term in server response.");
            return; // Stop processing
        }
        // --- End Checks --- 

        const termJustUpdated = result.term;
        const lowerTermUpdated = termJustUpdated.toLowerCase(); // Should be safe now
        const newStatus = result.status;
        const newTranslation = result.translation;

        // --- Update Cache First --- 
        vocabCache[lowerTermUpdated] = { status: newStatus, translation: newTranslation };
        const isMultiword = termJustUpdated.includes(' ');

        // If it was a multi-word term, refresh the multi-word cache and re-render text
        if (isMultiword) {
            console.log("Multi-word term updated. Refreshing cache and re-rendering text for:", termJustUpdated);
            try {
                // Refresh the multi-word cache
                multiwordTermsCache = await fetchMultiwordTerms(currentLanguageId);
                console.log("Refreshed multi-word cache:", multiwordTermsCache); // Log the new cache
                
                // Re-parse the original text (needed for buildStyledHtml)
                const textContainer = document.getElementById('text-container');
                const rawText = textContainer.dataset.rawText;
                const parsedElements = parseText(rawText);
                console.log("Re-parsed elements count:", parsedElements.length); // Log parsed elements
                
                // Re-build and re-inject HTML using updated caches
                const styledHtml = buildStyledHtml(parsedElements, vocabCache, multiwordTermsCache);
                console.log("Re-built HTML length:", styledHtml.length); // Log HTML length
                document.getElementById('parsed-text-area').innerHTML = styledHtml;
                addWordClickListeners(); // Re-attach listeners to the new spans
                
                // Update editor display AFTER re-rendering, ensure focus if possible
                populateWordEditor(termJustUpdated, newStatus, newTranslation); 
                
                // Try to re-select the new span
                const newSpan = document.querySelector(`#parsed-text-area .word[data-term="${escapeHtml(termJustUpdated)}"]`);
                 if (newSpan) {
                     console.log("Found and selected new multi-word span.");
                     newSpan.classList.add('selected');
                     // Optionally scroll into view
                     // newSpan.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                 } else {
                     console.log("Could not find the new multi-word span after re-render.");
                 }
            } catch(renderError) {
                 console.error("Error during multi-word re-render:", renderError);
                 alert("An error occurred while updating the display for the multi-word term.");
            }

        } else {
             // --- Update Single Word UI (existing logic) --- 
             // Update editor display
             populateWordEditor(termJustUpdated, newStatus, newTranslation);
             // Update all instances ON THE CURRENT PAGE
             // TODO: This needs to be smarter if the term spans pages, but for now...
             document.querySelectorAll('#parsed-text-area .word').forEach(span => {
                const spanTerm = span.dataset.term;
                if (spanTerm && spanTerm.toLowerCase() === lowerTermUpdated) {
                    span.dataset.status = newStatus;
                    span.dataset.translation = newTranslation || '';
                    for (let i = 0; i <= 7; i++) { span.classList.remove(getStatusClass(i)); }
                    span.classList.remove('word-unknown');
                    span.classList.add(getStatusClass(newStatus)); 
                }
            });
        }

    } catch (error) {
        console.error("Error updating term:", error);
        alert(`Failed to update term: ${error.message}`); // Basic error feedback
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

function setupPagination(allElements) {
    console.log(`Setting up pagination for ${allElements.length} elements.`);
    totalPages = Math.ceil(allElements.length / ELEMENTS_PER_PAGE);
    pagedElements = [];
    for (let i = 0; i < totalPages; i++) {
        const start = i * ELEMENTS_PER_PAGE;
        const end = start + ELEMENTS_PER_PAGE;
        pagedElements.push(allElements.slice(start, end));
    }
    
    currentPage = 1; // Reset to first page
    
    // Show controls
    const controls = document.getElementById('pagination-controls');
    if (controls) controls.style.display = 'block';

    // Add listeners (ensure they are added only once)
    const prevBtn = document.getElementById('prev-page-btn');
    const nextBtn = document.getElementById('next-page-btn');
    
    // Remove existing listeners before adding new ones to prevent duplicates
    prevBtn?.removeEventListener('click', handlePrevPage);
    nextBtn?.removeEventListener('click', handleNextPage);

    prevBtn?.addEventListener('click', handlePrevPage);
    nextBtn?.addEventListener('click', handleNextPage);

    updatePaginationUI(); // Set initial button states/text
}

function renderPage(pageNumber) {
    console.log(`Rendering page ${pageNumber}`);
    if (pageNumber < 1 || pageNumber > totalPages) {
        console.error("Invalid page number:", pageNumber);
        return;
    }
    currentPage = pageNumber; // Update global current page
    const elementsToRender = pagedElements[currentPage - 1] || [];
    
    // Build HTML for the current page's elements
    const styledHtml = buildStyledHtml(elementsToRender, vocabCache, multiwordTermsCache);
    const parsedTextArea = document.getElementById('parsed-text-area');
    if (parsedTextArea) {
        parsedTextArea.innerHTML = styledHtml;
        addWordClickListeners(); // Re-attach listeners
        // Scroll to top of text area after page change
        parsedTextArea.scrollTop = 0; 
    } else {
        console.error("#parsed-text-area not found during renderPage");
    }
    
    updatePaginationUI();
}

function handlePrevPage() {
    if (currentPage > 1) {
        renderPage(currentPage - 1);
    }
}

function handleNextPage() {
    if (currentPage < totalPages) {
        renderPage(currentPage + 1);
    }
}

function updatePaginationUI() {
    const prevBtn = document.getElementById('prev-page-btn');
    const nextBtn = document.getElementById('next-page-btn');
    const pageInfo = document.getElementById('page-info');

    if (pageInfo) {
        pageInfo.textContent = `Page ${currentPage} of ${totalPages}`;
    }
    if (prevBtn) {
        prevBtn.disabled = currentPage === 1;
    }
    if (nextBtn) {
        nextBtn.disabled = currentPage === totalPages;
    }
}

// --- End Pagination Functions ---

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