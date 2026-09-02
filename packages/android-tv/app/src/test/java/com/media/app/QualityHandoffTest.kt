package com.media.app

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class QualityHandoffTest {
    @Test
    fun incomingHlsSeekUsesElapsedOutgoingTime() {
        assertEquals(
            8_000L,
            QualityHandoff.incomingSeekMs(
                outgoingPositionMs = 28_000L,
                originPositionMs = 20_000L,
                incomingIsHls = true,
                incomingStartSeconds = 1412.0,
            ),
        )
    }

    @Test
    fun incomingProgressiveSeekUsesLiveFilePosition() {
        assertEquals(
            1_420_000L,
            QualityHandoff.incomingSeekMs(
                outgoingPositionMs = 28_000L,
                originPositionMs = 20_000L,
                incomingIsHls = false,
                incomingStartSeconds = 1412.0,
            ),
        )
    }

    @Test
    fun swapWaitsForBufferPastTheLivePlayhead() {
        assertFalse(QualityHandoff.canSwap(true, 8_200L, 8_000L))
        assertTrue(QualityHandoff.canSwap(true, 10_000L, 8_000L))
        assertFalse(QualityHandoff.canSwap(false, 30_000L, 8_000L))
    }
}
