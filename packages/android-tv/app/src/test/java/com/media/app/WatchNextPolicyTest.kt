package com.media.app

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class WatchNextPolicyTest {
    @Test
    fun contentIdIsStablePerTitle() {
        assertEquals("episode:42", WatchNextPolicy.contentId("episode", 42))
        assertEquals("movie:7", WatchNextPolicy.contentId("movie", 7))
    }

    @Test
    fun removesFinishedAndNearCompleteTitles() {
        assertTrue(WatchNextPolicy.shouldRemove(ended = true, positionMs = 10, durationMs = 1000))
        assertTrue(WatchNextPolicy.shouldRemove(ended = false, positionMs = 960, durationMs = 1000))
        assertFalse(WatchNextPolicy.shouldRemove(ended = false, positionMs = 100, durationMs = 1000))
        assertFalse(WatchNextPolicy.shouldRemove(ended = false, positionMs = 0, durationMs = 0))
    }

    @Test
    fun continueWatchingPositionStaysInsideDuration() {
        assertEquals(999, WatchNextPolicy.clampedPositionMs(1200, 1000))
        assertEquals(0, WatchNextPolicy.clampedPositionMs(-4, 1000))
        assertEquals(0, WatchNextPolicy.clampedPositionMs(50, 0))
    }
}
