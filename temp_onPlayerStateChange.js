function onPlayerStateChange(event) {
    const stateName = getPlayerStateName(event.data);
    console.log(`[YouTube Player] State changed to: ${stateName} (${event.data})`);
    
    // Log current time when state changes
    try {
        const currentTime = getCurrentPlayerTime();
        console.log(`[YouTube Player] Current time on state change: ${currentTime.toFixed(2)}s`);
    } catch (e) {
        console.error("[YouTube Player] Error getting current time on state change:", e);
    }

    switch (event.data) {
        case YT.PlayerState.UNSTARTED:
            console.log("[YouTube Player] Video is unstarted");
            break;
            
        case YT.PlayerState.ENDED:
            console.log("[YouTube Player] Video has ended");
            isVideoPlaying = false;
            if (!isRepeatModeActive) {
                console.log("[YouTube Player] Stopping video sync (video ended)");
                stopVideoSync();
            } else {
                console.log("[YouTube Player] Repeat mode active, not stopping sync");
            }
            break;
            
        case YT.PlayerState.PLAYING:
            console.log("[YouTube Player] Video is playing");
            isVideoPlaying = true;
            if (!isRepeatModeActive) {
                console.log("[YouTube Player] Starting video sync");
                startVideoSync();
            } else {
                console.log("[YouTube Player] Repeat mode active, not starting sync");
            }
            break;
            
        case YT.PlayerState.PAUSED:
            console.log("[YouTube Player] Video is paused");
            isVideoPlaying = false;
            if (!isRepeatModeActive) {
                console.log("[YouTube Player] Stopping video sync (paused)");
                stopVideoSync();
            } else {
                console.log("[YouTube Player] Repeat mode active, not stopping sync");
            }
            break;
            
        case YT.PlayerState.BUFFERING:
            console.log("[YouTube Player] Video is buffering");
            // Log buffering state and current time
            try {
                const currentTime = getCurrentPlayerTime();
                console.log(`[YouTube Player] Buffering at time: ${currentTime.toFixed(2)}s`);
            } catch (e) {
                console.error("[YouTube Player] Error getting current time during buffering:", e);
            }
            break;
            
        case YT.PlayerState.CUED:
            console.log("[YouTube Player] Video is cued");
            // Log video data when cued
            if (window.player?.getVideoData) {
                try {
                    const videoData = window.player.getVideoData();
                    console.log("[YouTube Player] Cued video data:", {
                        videoId: videoData.video_id,
                        title: videoData.title,
                        duration: window.player.getDuration ? window.player.getDuration() : 'N/A'
                    });
                } catch (e) {
                    console.error("[YouTube Player] Error getting cued video data:", e);
                }
            }
            break;
            
        default:
            console.warn(`[YouTube Player] Unknown player state received: ${event.data}`);
    }
}
