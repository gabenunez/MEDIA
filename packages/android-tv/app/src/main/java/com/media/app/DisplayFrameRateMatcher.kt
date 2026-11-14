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

        /** Max Hz a refresh rate may deviate from an exact integer multiple of
         * the content fps to still count as a "clean" cadence. 1.0 Hz admits
         * 23.976↔24 (and their 2×/3×) but rejects near-misses like 50 Hz for
         * 24 fps (off by ~2 Hz), which would judder worse than the panel default. */
        private const val CLEAN_MULTIPLE_TOLERANCE_HZ = 1.0f

        /** How far [refreshRate] sits from the nearest integer multiple of
         * [contentFps] (0 = perfect N× cadence). */
        private fun cadenceError(contentFps: Float, refreshRate: Float): Float {
            if (contentFps <= 0f || refreshRate <= 0f) return Float.MAX_VALUE
            val ratio = refreshRate / contentFps
            val nearestMultiple = ratio.roundToIntSafe()
            if (nearestMultiple < 1) return Float.MAX_VALUE
            // How far the refresh is from an exact N× of the content fps.
            return abs(refreshRate - contentFps * nearestMultiple)
        }

        private fun isCleanMultiple(contentFps: Float, refreshRate: Float): Boolean =
            cadenceError(contentFps, refreshRate) <= CLEAN_MULTIPLE_TOLERANCE_HZ

        private fun Float.roundToIntSafe(): Int = (this + 0.5f).toInt()

        /**
         * Choose the best mode at the current resolution for [contentFps].
         * Pure function so the selection logic is unit-testable.
         *
         * We ONLY switch to a refresh rate that is a genuinely clean integer
         * multiple of the content fps. If no such mode exists (e.g. a panel that
         * only offers 50/60 Hz for 24 fps film), we return null and leave the
         * display alone — forcing a near-miss like 50 Hz would judder worse than
         * the default. Among clean matches we prefer the lowest refresh rate
         * (24 Hz over 48/120 Hz: same smoothness, less power/heat).
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

            // Already on a clean cadence? Leave it.
            if (isCleanMultiple(contentFps, currentRefresh)) return null

            // Only clean integer-multiple refresh rates are acceptable targets.
            val clean = candidates.filter { isCleanMultiple(contentFps, it.refreshRate) }
            if (clean.isEmpty()) return null

            val best =
                clean.minWithOrNull(
                    compareBy<ModeInfo> { cadenceError(contentFps, it.refreshRate) }
                        .thenBy { it.refreshRate },
                ) ?: return null

            return if (best.refreshRate != currentRefresh) best else null
        }
    }
}
