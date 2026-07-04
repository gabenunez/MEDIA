package com.media.app

import android.content.Context
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.session.MediaSession

/** Exposes native playback to system voice controls and media keys (TV-VC). */
class PlaybackMediaSessionManager(
    context: Context,
    player: ExoPlayer,
) {
    private val mediaSession: MediaSession =
        MediaSession.Builder(context, player).build()

    fun release() {
        mediaSession.release()
    }
}
