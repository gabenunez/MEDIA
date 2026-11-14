package com.media.app

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class HevcDecoderQuirksTest {
    @Test
    fun flagsTheKnownJudderyHisensePanel() {
        // The measured device: Hisense "songshan" (MStar m7632).
        assertTrue(
            HevcDecoderQuirks.isJudderyHevcDecoder(
                device = "songshan",
                board = "m7632",
                product = "his9612",
            ),
        )
    }

    @Test
    fun matchesOnAnyOneSignalCaseInsensitively() {
        assertTrue(HevcDecoderQuirks.isJudderyHevcDecoder("SongShan", null, null))
        assertTrue(HevcDecoderQuirks.isJudderyHevcDecoder(null, "M7632", null))
        assertTrue(HevcDecoderQuirks.isJudderyHevcDecoder(null, null, "SONGSHAN"))
    }

    @Test
    fun leavesUnknownDevicesOnDirectPlay() {
        assertFalse(
            HevcDecoderQuirks.isJudderyHevcDecoder(
                device = "shieldtv",
                board = "mdarcy",
                product = "foster_e",
            ),
        )
        assertFalse(HevcDecoderQuirks.isJudderyHevcDecoder(null, null, null))
        assertFalse(HevcDecoderQuirks.isJudderyHevcDecoder("", "", ""))
    }
}
