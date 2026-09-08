package com.media.app

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class PlaybackPayloadTest {
    private fun payload(height: Int, width: Int) =
        PlaybackPayload(
            url = "https://example.test/reel/api/stream/1",
            title = "MEDIA!",
            posterUrl = null,
            fileId = 1,
            itemType = "movie",
            startSeconds = 0.0,
            durationMs = 0L,
            isHls = false,
            subtitleUrl = null,
            isHdr = false,
            dolbyVision = false,
            handoff = false,
            sourceHeight = height,
            sourceWidth = width,
        )

    @Test
    fun treatsMissingDimensionsAsUhdSafe() {
        assertTrue(payload(0, 0).isUhd)
    }

    @Test
    fun treatsExplicitUhdAsUhd() {
        assertTrue(payload(2160, 3840).isUhd)
    }

    @Test
    fun treatsHdDimensionsAsNonUhd() {
        assertFalse(payload(1080, 1920).isUhd)
    }
}
