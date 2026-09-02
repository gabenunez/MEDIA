package com.media.app

import org.junit.Assert.assertEquals
import org.junit.Test

class NativeWebOverlayTest {
    @Test
    fun raisingAlwaysBringsWebViewToFront() {
        assertEquals(true, NativeWebOverlay.shouldBringWebViewToFront(1f))
        assertEquals(true, NativeWebOverlay.shouldBringWebViewToFront(0.01f))
        assertEquals(false, NativeWebOverlay.shouldBringWebViewToFront(0f))
    }
}
