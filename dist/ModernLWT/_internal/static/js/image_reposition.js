document.addEventListener('DOMContentLoaded', () => {
    let isDragging = false;
    let startX, startY;
    let currentCard = null;
    let originalPosition = {};

    // Helper function to get background position
    function getBackgroundPosition(element) {
        const style = window.getComputedStyle(element);
        const position = style.backgroundPosition.split(' ');
        return {
            x: parseFloat(position[0]) || 50,
            y: parseFloat(position[1]) || 50
        };
    }

    // Helper function to set background position
    function setBackgroundPosition(element, x, y) {
        element.style.backgroundPosition = `${x}% ${y}%`;
    }

    // Initialize repositioning
    function initializeRepositioning(card) {
        if (currentCard) return; // Prevent multiple cards from being repositioned
        
        currentCard = card;
        currentCard.classList.add('repositioning');
        
        // Store original position
        originalPosition = getBackgroundPosition(currentCard);
        
        // Show overlay
        const overlay = currentCard.querySelector('.reposition-overlay');
        if (overlay) overlay.style.display = 'flex';
        
        // Add event listeners
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    }

    // Handle mouse movement during repositioning
    function handleMouseMove(e) {
        if (!currentCard || !isDragging) return;

        const rect = currentCard.getBoundingClientRect();
        const xPercent = ((e.clientX - rect.left) / rect.width) * 100;
        const yPercent = ((e.clientY - rect.top) / rect.height) * 100;

        // Limit the range to 0-100%
        const limitedX = Math.max(0, Math.min(100, xPercent));
        const limitedY = Math.max(0, Math.min(100, yPercent));

        setBackgroundPosition(currentCard, limitedX, limitedY);
    }

    // Handle mouse up event
    function handleMouseUp() {
        isDragging = false;
    }

    // Save the new position
    function savePosition() {
        if (!currentCard) return;

        const newPosition = getBackgroundPosition(currentCard);
        currentCard.dataset.bgPosition = `${newPosition.x}% ${newPosition.y}%`;
        
        // Here you would typically send the new position to the server
        // For now, we'll just log it
        console.log('New position saved:', newPosition);
        
        cleanupRepositioning();
    }

    // Cancel repositioning
    function cancelPosition() {
        if (!currentCard) return;
        
        setBackgroundPosition(currentCard, originalPosition.x, originalPosition.y);
        cleanupRepositioning();
    }

    // Cleanup after repositioning
    function cleanupRepositioning() {
        if (!currentCard) return;

        const overlay = currentCard.querySelector('.reposition-overlay');
        if (overlay) overlay.style.display = 'none';

        currentCard.classList.remove('repositioning');
        currentCard = null;
        isDragging = false;

        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
    }

    // Add event listeners to all reposition buttons
    document.querySelectorAll('.reposition-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            const card = btn.closest('.lesson-card-image') || btn.closest('.language-card-image');
            if (!card) return;

            initializeRepositioning(card);
        });
    });

    // Add event listeners to save and cancel buttons
    document.querySelectorAll('.save-position-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            savePosition();
        });
    });

    document.querySelectorAll('.cancel-position-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            cancelPosition();
        });
    });

    // Add mousedown event listener to cards in repositioning mode
    document.addEventListener('mousedown', (e) => {
        if (!currentCard) return;

        const isOverlay = e.target.closest('.reposition-overlay');
        const isButton = e.target.closest('button');
        
        if (isOverlay && !isButton) {
            e.preventDefault();
            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
        }
    });
}); 