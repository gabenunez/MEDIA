package com.media.app

import android.view.KeyEvent
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class WatchRemoteKeysTest {
    @Test
    fun mapsDpadToWebKeys() {
        assertEquals("ArrowUp", WatchRemoteKeys.webKeyName(KeyEvent.KEYCODE_DPAD_UP))
        assertEquals("ArrowDown", WatchRemoteKeys.webKeyName(KeyEvent.KEYCODE_DPAD_DOWN))
        assertEquals("ArrowLeft", WatchRemoteKeys.webKeyName(KeyEvent.KEYCODE_DPAD_LEFT))
        assertEquals("ArrowRight", WatchRemoteKeys.webKeyName(KeyEvent.KEYCODE_DPAD_RIGHT))
        assertEquals("Enter", WatchRemoteKeys.webKeyName(KeyEvent.KEYCODE_DPAD_CENTER))
        assertEquals("Enter", WatchRemoteKeys.webKeyName(KeyEvent.KEYCODE_ENTER))
        assertEquals("MediaRewind", WatchRemoteKeys.webKeyName(KeyEvent.KEYCODE_MEDIA_REWIND))
        assertEquals(
            "MediaFastForward",
            WatchRemoteKeys.webKeyName(KeyEvent.KEYCODE_MEDIA_FAST_FORWARD),
        )
    }

    @Test
    fun ignoresUnrelatedKeys() {
        assertNull(WatchRemoteKeys.webKeyName(KeyEvent.KEYCODE_BACK))
        assertNull(WatchRemoteKeys.webKeyName(KeyEvent.KEYCODE_MEDIA_PLAY))
    }

    @Test
    fun injectsDpadOnlyWhenPlayerIsInFrontOfWebView() {
        assertEquals(true, WatchRemoteKeys.shouldInjectDpad(true, false))
        assertEquals(false, WatchRemoteKeys.shouldInjectDpad(true, true))
        assertEquals(false, WatchRemoteKeys.shouldInjectDpad(false, false))
        assertEquals(false, WatchRemoteKeys.shouldInjectDpad(false, true))
    }
}
