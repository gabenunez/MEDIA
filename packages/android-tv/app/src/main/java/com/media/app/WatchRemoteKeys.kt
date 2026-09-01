package com.media.app

import android.view.KeyEvent

/**
 * D-pad mapping for the TV shell.
 *
 * Android TV WebView does not reliably deliver remote D-pad `keydown` to JS —
 * emulator keyboards do, which is why arrows work there and not on a real
 * remote. Play/Pause already injects for that reason. Inject D-pad the same
 * way on every screen (catalog and player), consume the native event, and
 * dispatch on `window` so spatial nav / watch-view see it.
 */
object WatchRemoteKeys {
    fun webKeyName(keyCode: Int): String? =
        when (keyCode) {
            KeyEvent.KEYCODE_DPAD_UP,
            KeyEvent.KEYCODE_SYSTEM_NAVIGATION_UP,
            -> "ArrowUp"
            KeyEvent.KEYCODE_DPAD_DOWN,
            KeyEvent.KEYCODE_SYSTEM_NAVIGATION_DOWN,
            -> "ArrowDown"
            KeyEvent.KEYCODE_DPAD_LEFT,
            KeyEvent.KEYCODE_SYSTEM_NAVIGATION_LEFT,
            -> "ArrowLeft"
            KeyEvent.KEYCODE_DPAD_RIGHT,
            KeyEvent.KEYCODE_SYSTEM_NAVIGATION_RIGHT,
            -> "ArrowRight"
            KeyEvent.KEYCODE_DPAD_CENTER,
            KeyEvent.KEYCODE_ENTER,
            KeyEvent.KEYCODE_NUMPAD_ENTER,
            -> "Enter"
            KeyEvent.KEYCODE_MEDIA_REWIND -> "MediaRewind"
            KeyEvent.KEYCODE_MEDIA_FAST_FORWARD -> "MediaFastForward"
            else -> null
        }

    /** Remote D-pad never reaches JS on this TV — inject even when idle. */
    fun shouldInjectDpad(): Boolean = true

    fun dispatchScript(key: String): String {
        val escaped = key.replace("\\", "\\\\").replace("'", "\\'")
        val keyCode = jsKeyCode(key)
        return """
            (function(){
              window.dispatchEvent(new KeyboardEvent('keydown', {
                key: '$escaped',
                code: '$escaped',
                keyCode: $keyCode,
                which: $keyCode,
                bubbles: true,
                cancelable: true
              }));
            })();
            """.trimIndent()
    }

    private fun jsKeyCode(key: String): Int =
        when (key) {
            "ArrowLeft" -> 37
            "ArrowUp" -> 38
            "ArrowRight" -> 39
            "ArrowDown" -> 40
            "Enter" -> 13
            else -> 0
        }
}
