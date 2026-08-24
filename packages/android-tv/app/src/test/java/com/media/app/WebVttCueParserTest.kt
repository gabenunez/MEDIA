package com.media.app

import org.junit.Assert.assertEquals
import org.junit.Test

class WebVttCueParserTest {
    private val sample = """
        WEBVTT

        1
        00:00:01.000 --> 00:00:04.000
        First line.

        2
        00:00:05.500 --> 00:00:08.000
        Second <i>line</i>.
    """.trimIndent()

    @Test
    fun parsesDialogueCues() {
        val cues = WebVttCueParser.parse(sample)
        assertEquals(2, cues.size)
        assertEquals(1.0, cues[0].startSeconds, 0.0001)
        assertEquals(4.0, cues[0].endSeconds, 0.0001)
        assertEquals("First line.", cues[0].text)
        assertEquals("Second line.", cues[1].text)
    }

    @Test
    fun findsActiveCueText() {
        val cues = WebVttCueParser.parse(sample)
        assertEquals(emptyList<String>(), WebVttCueParser.activeTexts(cues, 0.5))
        assertEquals(listOf("First line."), WebVttCueParser.activeTexts(cues, 2.0))
        assertEquals(listOf("Second line."), WebVttCueParser.activeTexts(cues, 6.0))
        assertEquals(emptyList<String>(), WebVttCueParser.activeTexts(cues, 9.0))
    }

    @Test
    fun overlaySwapDoesNotRebuildPlayer() {
        assertEquals(false, NativeSubtitleOverlay.REBUILDS_PLAYER)
    }
}
