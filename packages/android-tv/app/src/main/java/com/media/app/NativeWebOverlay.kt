package com.media.app

/**
 * WebView overlay z-order over ExoPlayer.
 *
 * Hiding chrome puts the player view in front. Stopping that title marks
 * lastAlpha=1 without bringToFront, so the next title's alpha=1 used to be a
 * no-op and the control bar never appeared.
 */
object NativeWebOverlay {
    fun shouldBringWebViewToFront(alpha: Float): Boolean = alpha > 0f
}
