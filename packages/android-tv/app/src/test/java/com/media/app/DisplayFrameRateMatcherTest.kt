package com.media.app

import com.media.app.DisplayFrameRateMatcher.Companion.pickBestMode
import com.media.app.DisplayFrameRateMatcher.ModeInfo
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class DisplayFrameRateMatcherTest {
    private val w = 1920
    private val h = 1080

    private fun modes(vararg refresh: Float): List<ModeInfo> =
        refresh.mapIndexed { i, r -> ModeInfo(modeId = i + 1, width = w, height = h, refreshRate = r) }

    @Test
    fun picks24HzFor24fpsContentOffA60HzDisplay() {
        // The House case: 23.976fps content currently on a 60Hz panel.
        val available = modes(60f, 50f, 24f, 30f)
        val best =
            pickBestMode(
                contentFps = 23.976f,
                currentWidth = w,
                currentHeight = h,
                currentRefresh = 60f,
                modes = available,
            )
        assertEquals(24f, best!!.refreshRate)
    }

    @Test
    fun prefersExactFractionalRateWhenAvailable() {
        // A proper 23.976 mode beats the integer 24 for 23.976 content.
        val available = modes(60f, 24f, 23.976f, 59.94f)
        val best =
            pickBestMode(23.976f, w, h, 60f, available)
        assertEquals(23.976f, best!!.refreshRate)
    }

    @Test
    fun prefersLowestCleanMultipleOnTies() {
        // 24, 48, 120 are all clean multiples of 24; choose the lowest (24).
        val available = modes(120f, 48f, 24f, 60f)
        val best = pickBestMode(24f, w, h, 60f, available)
        assertEquals(24f, best!!.refreshRate)
    }

    @Test
    fun matches50HzForPalStyle25fpsContent() {
        val available = modes(60f, 50f, 24f)
        val best = pickBestMode(25f, w, h, 60f, available)
        assertEquals(50f, best!!.refreshRate)
    }

    @Test
    fun leaves60HzAloneFor30fpsContent() {
        // 60 is already a clean 2x of 30 — no better mode exists, so don't switch.
        val available = modes(60f, 50f, 24f)
        val best = pickBestMode(30f, w, h, 60f, available)
        assertNull(best)
    }

    @Test
    fun leaves60HzAloneFor60fpsContent() {
        val available = modes(60f, 50f, 24f, 30f)
        val best = pickBestMode(60f, w, h, 60f, available)
        assertNull(best)
    }

    @Test
    fun doesNotSwitchTo50HzForFilmContentWhenNoCleanModeExists() {
        // The real-world case on a 50/60-only panel: 50Hz is NOT a clean
        // multiple of 23.976 (off by ~2Hz) and would judder worse than 60Hz's
        // 3:2 pulldown. Must leave the display alone rather than force 50Hz.
        val panel = modes(60.000004f, 50f)
        assertNull(pickBestMode(23.976f, w, h, 60.000004f, panel))
        assertNull(pickBestMode(24f, w, h, 60.000004f, panel))
    }

    @Test
    fun switchesTo50HzOnlyForTrue25fpsContentNotFilm() {
        val panel = modes(60f, 50f)
        // 25fps: 50Hz is a clean 2x -> switch.
        assertEquals(50f, pickBestMode(25f, w, h, 60f, panel)!!.refreshRate)
        // 23.976fps on the same panel: no clean mode -> no switch.
        assertNull(pickBestMode(23.976f, w, h, 60f, panel))
    }

    @Test
    fun neverChangesResolutionForARefreshSwap() {
        // A 24Hz mode exists only at a different resolution; ignore it and stay.
        val mixed =
            listOf(
                ModeInfo(1, w, h, 60f),
                ModeInfo(2, 3840, 2160, 24f), // 24Hz but wrong resolution
            )
        val best = pickBestMode(24f, w, h, 60f, mixed)
        // Only same-resolution modes are considered; the single 60Hz one is no
        // better than current, so no switch.
        assertNull(best)
    }

    @Test
    fun returnsNullWhenNoModes() {
        assertNull(pickBestMode(24f, w, h, 60f, emptyList()))
    }
}
