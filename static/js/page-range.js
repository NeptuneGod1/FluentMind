// Page Range functionality for the language learning app

// Initialize the page range functionality
function initializePageRange() {
    const repeatRangeBtn = document.getElementById('repeat-range-btn');
    const pageRangeModal = document.getElementById('pageRangeModal');
    const startPageInput = document.getElementById('startPageInput');
    const endPageInput = document.getElementById('endPageInput');
    const applyRangeBtn = document.getElementById('applyRangeBtn');
    
    if (!repeatRangeBtn || !pageRangeModal) return;
    
    // Show modal when the range button is clicked
    repeatRangeBtn.addEventListener('click', function() {
        // If already in range mode, toggle it off
        if (window.currentRepeatMode === 'range') {
            toggleRepeatMode('range');
            return;
        }
        
        // Otherwise, open the modal to set a new range
        startPageInput.value = currentPage || 1;
        endPageInput.value = currentPage || 1;
        
        // Show the modal using Bootstrap's modal method
        const modal = new bootstrap.Modal(pageRangeModal);
        modal.show();
    });
    
    // Handle apply button click
    if (applyRangeBtn) {
        applyRangeBtn.addEventListener('click', function() {
            const startPage = parseInt(startPageInput.value, 10);
            const endPage = parseInt(endPageInput.value, 10);
            const totalPages = pageInfo?.length || 0;
            
            // Validate inputs
            if (isNaN(startPage) || isNaN(endPage) || startPage < 1 || endPage < 1) {
                alert('Please enter valid page numbers');
                return;
            }
            
            if (startPage > endPage) {
                alert('Start page cannot be greater than end page');
                return;
            }
            
            if (startPage > totalPages || endPage > totalPages) {
                alert(`Page range exceeds total pages (${totalPages})`);
                return;
            }
            
            // Calculate start time (beginning of start page)
            const startPageInfo = pageInfo[Math.min(startPage - 1, pageInfo.length - 1)];
            let startTime = 0;
            if (startPageInfo && startPageInfo.firstGlobalParagraphIndex < timestamps.length) {
                startTime = timestamps[startPageInfo.firstGlobalParagraphIndex].timestamp;
            }
            
            // Calculate end time (beginning of the page *after* the end page)
            let endTime = getCurrentPlayerDuration(); // Default to the very end of the media
            if (endPage < totalPages) {
                // If it's not the last page, the end time is the start of the next page
                const nextPageInfo = pageInfo[endPage]; // Get info for the page *after* endPage
                if (nextPageInfo && nextPageInfo.firstGlobalParagraphIndex < timestamps.length) {
                    endTime = timestamps[nextPageInfo.firstGlobalParagraphIndex].timestamp;
                }
            }
            
            // Get the modal instance and hide it FIRST
            const modalInstance = bootstrap.Modal.getInstance(pageRangeModal);
            if (modalInstance) {
                // Use an event listener to ensure the modal is fully hidden before proceeding
                pageRangeModal.addEventListener('hidden.bs.modal', function onModalHidden() {
                    // Remove this listener so it doesn't fire again
                    pageRangeModal.removeEventListener('hidden.bs.modal', onModalHidden);

                    // Always reset existing range repeat first (if already active)
                    if (window.currentRepeatMode === 'range') {
                        toggleRepeatMode('range'); // this will turn it off
                    }

                    // Now enable range repeat with the new parameters
                    const isActive = toggleRepeatMode('range', startTime, endTime);

                    // Update button appearance based on the returned state
                    repeatRangeBtn.classList.toggle('active-repeat', isActive);

                    // Return focus to the button that opened the modal
                    repeatRangeBtn.focus();
                }, { once: true }); // Ensure the listener runs only once

                modalInstance.hide();
            }
        });
    }
    

}

// Export for testing if needed
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { initializePageRange };
}
