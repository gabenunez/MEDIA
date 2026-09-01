package com.media.app

import android.view.KeyEvent

/**
 * D-pad mapping for native playback. When ExoPlayer is in front of the
 * WebView (overlay alpha 0), those keys never reach JS unless we inject them.
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
}
