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
        assertEquals("ArrowUp", WatchRemoteKeys.webKeyName(KeyEvent.KEYCODE_SYSTEM_NAVIGATION_UP))
        assertEquals("ArrowDown", WatchRemoteKeys.webKeyName(KeyEvent.KEYCODE_SYSTEM_NAVIGATION_DOWN))
        assertEquals("ArrowLeft", WatchRemoteKeys.webKeyName(KeyEvent.KEYCODE_SYSTEM_NAVIGATION_LEFT))
        assertEquals("ArrowRight", WatchRemoteKeys.webKeyName(KeyEvent.KEYCODE_SYSTEM_NAVIGATION_RIGHT))
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
    fun alwaysInjectsDpad() {
        assertEquals(true, WatchRemoteKeys.shouldInjectDpad())
    }

    @Test
    fun dispatchScriptDispatchesOnWindow() {
        val script = WatchRemoteKeys.dispatchScript("ArrowLeft")
        assertEquals(true, script.contains("window.dispatchEvent"))
        assertEquals(true, script.contains("key: 'ArrowLeft'"))
        assertEquals(false, script.contains("document.activeElement"))
    }
}
