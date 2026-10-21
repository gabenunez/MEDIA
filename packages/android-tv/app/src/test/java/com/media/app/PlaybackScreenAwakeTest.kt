package com.media.app

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import androidx.media3.common.Player

class PlaybackScreenAwakeTest {
    @Test
    fun stateCodesMatchExoPlayer() {
        assertEquals(Player.STATE_IDLE, PlaybackScreenAwake.STATE_IDLE)
        assertEquals(Player.STATE_BUFFERING, PlaybackScreenAwake.STATE_BUFFERING)
        assertEquals(Player.STATE_READY, PlaybackScreenAwake.STATE_READY)
        assertEquals(Player.STATE_ENDED, PlaybackScreenAwake.STATE_ENDED)
    }

    @Test
    fun staysAwakeWhileTheViewerAskedToPlay() {
        assertTrue(
            PlaybackScreenAwake.shouldKeepScreenOn(
                playerPresent = true,
                playWhenReady = true,
                playbackState = PlaybackScreenAwake.STATE_READY,
            ),
        )
        assertTrue(
            PlaybackScreenAwake.shouldKeepScreenOn(
                playerPresent = true,
                playWhenReady = true,
                playbackState = PlaybackScreenAwake.STATE_BUFFERING,
            ),
        )
        assertTrue(
            PlaybackScreenAwake.shouldKeepScreenOn(
                playerPresent = true,
                playWhenReady = true,
                playbackState = PlaybackScreenAwake.STATE_IDLE,
            ),
        )
    }

    @Test
    fun allowsSleepWhenPausedStoppedOrFinished() {
        assertFalse(
            PlaybackScreenAwake.shouldKeepScreenOn(
                playerPresent = true,
                playWhenReady = false,
                playbackState = PlaybackScreenAwake.STATE_READY,
            ),
        )
        assertFalse(
            PlaybackScreenAwake.shouldKeepScreenOn(
                playerPresent = false,
                playWhenReady = true,
                playbackState = PlaybackScreenAwake.STATE_READY,
            ),
        )
        assertFalse(
            PlaybackScreenAwake.shouldKeepScreenOn(
                playerPresent = true,
                playWhenReady = true,
                playbackState = PlaybackScreenAwake.STATE_ENDED,
            ),
        )
    }
}
