package com.media.app

import android.app.Activity
import android.os.Build
import android.util.Log
import android.view.Display
import android.view.WindowManager
import kotlin.math.abs

/**
 * Switches the TV's display refresh rate to match the content frame rate so
 * 23.976/24/25 fps video isn't force-fit onto a 60 Hz panel.
 *
 * Why this matters: without matching, 23.976 fps content on a 60 Hz output is
 * shown with an uneven 3:2 cadence (some frames held 2 refreshes, some 3). That
 * produces a regular, recurring judder — visible as "stuttering" especially on
 * slow pans — that no amount of buffering can fix, because it's a display-timing
 * problem, not a data-delivery one.
 *
 * We pick a supported display mode at the CURRENT resolution whose refresh rate
 * is an exact multiple of the content fps (so 23.976 → 23.976/47.952/59.94, or
 * 24 → 24/48/120), falling back to the closest multiple, and restore the
 * original mode when playback stops.
 */
class DisplayFrameRateMatcher(private val activity: Activity) {
    private var originalModeId: Int? = null

    fun applyForContentFrameRate(frameRate: Float) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return
        if (frameRate <= 0f) {
            reset()
            return
        }

        val display = resolveDisplay() ?: return
        val current = display.mode ?: return
        val modes = display.supportedModes ?: return

        val best =
            pickBestMode(
                contentFps = frameRate,
                currentWidth = current.physicalWidth,
                currentHeight = current.physicalHeight,
                currentRefresh = current.refreshRate,
                modes =
                    modes.map {
                        ModeInfo(it.modeId, it.physicalWidth, it.physicalHeight, it.refreshRate)
                    },
            )

        if (best == null || best.modeId == current.modeId) return

        if (originalModeId == null) originalModeId = current.modeId
        setPreferredModeId(best.modeId)
        Log.i(
            TAG,
            "Matched display to content ${"%.3f".format(frameRate)}fps -> mode ${best.modeId} " +
                "(${best.width}x${best.height}@${"%.3f".format(best.refreshRate)}Hz)",
        )
    }

    fun reset() {
        val restore = originalModeId ?: return
        originalModeId = null
        setPreferredModeId(restore)
        Log.i(TAG, "Restored display mode $restore")
    }

    @Suppress("DEPRECATION")
    private fun resolveDisplay(): Display? {
        // activity.display is API 30+; fall back to the WindowManager default
        // display on API 23–29 (preferredDisplayModeId is supported from 23).
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            activity.display
        } else {
            activity.windowManager.defaultDisplay
        }
    }

    private fun setPreferredModeId(modeId: Int) {
        activity.runOnUiThread {
            val params: WindowManager.LayoutParams = activity.window.attributes
            params.preferredDisplayModeId = modeId
            activity.window.attributes = params
        }
    }

    data class ModeInfo(
        val modeId: Int,
        val width: Int,
        val height: Int,
        val refreshRate: Float,
    )

    companion object {
        private const val TAG = "MediaNativePlayer"

        /** A refresh rate "cleanly divides" the content when it's an integer
         * multiple (1x/2x/3x/...), within a small tolerance for 23.976-style
         * fractional rates. */
        private fun cadenceError(contentFps: Float, refreshRate: Float): Float {
            if (contentFps <= 0f || refreshRate <= 0f) return Float.MAX_VALUE
            val ratio = refreshRate / contentFps
            val nearestMultiple = ratio.roundToIntSafe()
            if (nearestMultiple < 1) return Float.MAX_VALUE
            // How far the refresh is from an exact N× of the content fps.
            return abs(refreshRate - contentFps * nearestMultiple)
        }

        private fun Float.roundToIntSafe(): Int = (this + 0.5f).toInt()

        /**
         * Choose the best mode at the current resolution for [contentFps].
         * Pure function so the selection logic is unit-testable.
         *
         * Preference order:
         *  1. Same resolution as current (never change resolution for a refresh swap).
         *  2. Smallest cadence error (exact N× multiple of content fps is ideal).
         *  3. Lowest refresh rate among ties (24 Hz beats 120 Hz for 24 fps —
         *     less power/heat, same smoothness).
         */
        fun pickBestMode(
            contentFps: Float,
            currentWidth: Int,
            currentHeight: Int,
            currentRefresh: Float,
            modes: List<ModeInfo>,
        ): ModeInfo? {
            val sameRes =
                modes.filter {
                    it.width == currentWidth && it.height == currentHeight
                }
            val candidates = if (sameRes.isNotEmpty()) sameRes else modes
            if (candidates.isEmpty()) return null

            // Only switch if some mode is a meaningfully better cadence match than
            // the one we're already on; otherwise leave the display alone.
            val currentError = cadenceError(contentFps, currentRefresh)

            val best =
                candidates.minWithOrNull(
                    compareBy<ModeInfo> { cadenceError(contentFps, it.refreshRate) }
                        .thenBy { it.refreshRate },
                ) ?: return null

            val bestError = cadenceError(contentFps, best.refreshRate)
            // Require at least a 0.5 Hz improvement to avoid pointless mode flips.
            return if (bestError + 0.5f < currentError) best else null
        }
    }
}
