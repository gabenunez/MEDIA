package com.media.app

import android.graphics.Color
import android.graphics.Typeface
import androidx.media3.ui.CaptionStyleCompat
import androidx.media3.ui.SubtitleView
import org.json.JSONObject

object SubtitleStyleMapper {
    private val colorRgb =
        mapOf(
            "white" to intArrayOf(255, 255, 255),
            "yellow" to intArrayOf(255, 235, 59),
            "green" to intArrayOf(118, 255, 122),
            "cyan" to intArrayOf(77, 232, 255),
            "blue" to intArrayOf(130, 170, 255),
            "magenta" to intArrayOf(255, 128, 255),
            "red" to intArrayOf(255, 107, 107),
            "black" to intArrayOf(0, 0, 0),
        )

    fun apply(subtitleView: SubtitleView?, json: String): Boolean {
        if (subtitleView == null) return false

        return try {
            val obj = JSONObject(json)
            val size = obj.optString("size", "large")
            val font = obj.optString("font", "default")
            val color = obj.optString("color", "black")
            val opacity = obj.optString("opacity", "100")
            val background = obj.optString("background", "none")
            val backgroundOpacity = obj.optString("backgroundOpacity", "0")
            val edge = obj.optString("edge", "outline")

            val foregroundArgb = rgbaArgb(color, opacity)
            val backgroundArgb =
                when {
                    background == "none" || backgroundOpacity == "0" -> Color.TRANSPARENT
                    else -> rgbaArgb(background, backgroundOpacity)
                }

            val edgeType =
                when (edge) {
                    "outline" -> CaptionStyleCompat.EDGE_TYPE_OUTLINE
                    "drop-shadow" -> CaptionStyleCompat.EDGE_TYPE_DROP_SHADOW
                    else -> CaptionStyleCompat.EDGE_TYPE_NONE
                }

            val typeface =
                when (font) {
                    "serif" -> Typeface.SERIF
                    "monospace" -> Typeface.MONOSPACE
                    else -> Typeface.DEFAULT
                }

            val fractionalSize =
                when (size) {
                    "small" -> 0.045f
                    "large" -> 0.065f
                    "extra-large" -> 0.08f
                    else -> 0.053f
                }

            val style =
                CaptionStyleCompat(
                    foregroundArgb,
                    backgroundArgb,
                    Color.TRANSPARENT,
                    edgeType,
                    Color.BLACK,
                    typeface,
                )

            subtitleView.setApplyEmbeddedStyles(false)
            subtitleView.setApplyEmbeddedFontSizes(false)
            subtitleView.setStyle(style)
            subtitleView.setFractionalTextSize(fractionalSize, false)
            true
        } catch (_: Exception) {
            false
        }
    }

    private fun rgbaArgb(colorName: String, opacityPercent: String): Int {
        val rgb = colorRgb[colorName] ?: colorRgb.getValue("white")
        val alpha = (opacityPercent.toIntOrNull() ?: 100).coerceIn(0, 100) * 255 / 100
        return Color.argb(alpha, rgb[0], rgb[1], rgb[2])
    }
}
