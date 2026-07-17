package com.media.app

import org.junit.Assert.assertEquals
import org.junit.Test

class PlaybackUrlTest {
    @Test
    fun sanitize_collapsesDoublePublicPrefix() {
        assertEquals(
            "https://media.example.com/reel/api/stream/42?type=movie",
            PlaybackUrl.sanitize(
                "https://media.example.com/reel/reel/api/stream/42?type=movie",
            ),
        )
    }

    @Test
    fun sanitize_leavesCorrectPrefixAlone() {
        assertEquals(
            "https://media.example.com/reel/api/stream/42?type=movie",
            PlaybackUrl.sanitize(
                "https://media.example.com/reel/api/stream/42?type=movie",
            ),
        )
    }

    @Test
    fun sanitize_leavesUnrelatedRepeatedSegments() {
        assertEquals(
            "https://example.com/foo/foo/bar",
            PlaybackUrl.sanitize("https://example.com/foo/foo/bar"),
        )
    }
}
