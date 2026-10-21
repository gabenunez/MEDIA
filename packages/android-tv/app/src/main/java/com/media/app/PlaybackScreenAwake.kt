package com.media.app

/**
 * Whether video playback should hold the display awake.
 *
 * ExoPlayer's [androidx.media3.common.Player.isPlaying] is false during
 * buffering, seeking, and the moment after resume. Android TV starts ambient
 * mode after about ten minutes without [android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON],
 * so those gaps put the panel to sleep in the middle of a title.
 *
 * State codes match [androidx.media3.common.Player].
 */
internal object PlaybackScreenAwake {
    const val STATE_IDLE = 1
    const val STATE_BUFFERING = 2
    const val STATE_READY = 3
    const val STATE_ENDED = 4

    fun shouldKeepScreenOn(
        playerPresent: Boolean,
        playWhenReady: Boolean,
        playbackState: Int,
    ): Boolean {
        if (!playerPresent || !playWhenReady) return false
        return playbackState != STATE_ENDED
    }
}
