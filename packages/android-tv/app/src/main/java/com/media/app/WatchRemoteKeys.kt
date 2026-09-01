package com.media.app

import android.view.KeyEvent

/**
 * D-pad mapping for native playback.
 *
 * Android TV WebView does not reliably deliver D-pad `keydown` to JS — Play/
 * Pause works only because we inject those keys. The same inject must run
 * whether ExoPlayer or the WebView is in front. Dispatch on `window` so
 * watch-view always sees D-pad; it owns transport Left/Right itself.
 */
object WatchRemoteKeys {
    fun webKeyName(keyCode: Int): String? =
        when (keyCode) {
            KeyEvent.KEYCODE_DPAD_UP -> "ArrowUp"
            KeyEvent.KEYCODE_DPAD_DOWN -> "ArrowDown"
            KeyEvent.KEYCODE_DPAD_LEFT -> "ArrowLeft"
            KeyEvent.KEYCODE_DPAD_RIGHT -> "ArrowRight"
            KeyEvent.KEYCODE_DPAD_CENTER,
            KeyEvent.KEYCODE_ENTER,
            KeyEvent.KEYCODE_NUMPAD_ENTER,
            -> "Enter"
            KeyEvent.KEYCODE_MEDIA_REWIND -> "MediaRewind"
            KeyEvent.KEYCODE_MEDIA_FAST_FORWARD -> "MediaFastForward"
            else -> null
        }

    fun shouldInjectDpad(playerActive: Boolean): Boolean = playerActive

    fun dispatchScript(key: String): String {
        val escaped = key.replace("\\", "\\\\").replace("'", "\\'")
        return """
            (function(){
              window.dispatchEvent(new KeyboardEvent('keydown', {
                key: '$escaped',
                bubbles: true,
                cancelable: true
              }));
            })();
            """.trimIndent()
    }
}
