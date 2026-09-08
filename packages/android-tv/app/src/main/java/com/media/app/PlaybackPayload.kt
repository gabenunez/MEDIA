package com.media.app

import org.json.JSONObject

data class PlaybackPayload(
    val url: String,
    val title: String,
    val posterUrl: String?,
    val fileId: Int,
    val itemType: String,
    val startSeconds: Double,
    val durationMs: Long,
    val isHls: Boolean,
    val subtitleUrl: String?,
    val isHdr: Boolean,
    val dolbyVision: Boolean,
    /** Keep the current player running until this payload is ready to take over. */
    val handoff: Boolean,
    /** Source coded height when known — picks a tighter ExoPlayer buffer for UHD. */
    val sourceHeight: Int,
    /** Source coded width when known. */
    val sourceWidth: Int,
) {
    /**
     * Prefer the short UHD buffer when coded size is UHD or still unknown.
     * Unknown defaults to the safe profile so an older web shell cannot ask
     * ExoPlayer to hold ~2 minutes of 4K before the hard byte ceiling applies.
     */
    val isUhd: Boolean
        get() =
            sourceHeight >= 2160 ||
                sourceWidth >= 3840 ||
                (sourceHeight <= 0 && sourceWidth <= 0)


    companion object {
        fun parse(json: String): PlaybackPayload? {
            return try {
                val obj = JSONObject(json)
                PlaybackPayload(
                    url = PlaybackUrl.sanitize(obj.getString("url")),
                    title = obj.optString("title", "MEDIA!"),
                    posterUrl = obj.optString("posterUrl").takeIf { it.isNotBlank() }
                        ?.let(PlaybackUrl::sanitize),
                    fileId = obj.getInt("fileId"),
                    itemType = obj.getString("itemType"),
                    startSeconds = obj.optDouble("startSeconds", 0.0),
                    durationMs = obj.optLong("durationMs", 0L),
                    isHls = obj.optBoolean("isHls", false),
                    subtitleUrl = obj.optString("subtitleUrl").takeIf { it.isNotBlank() }
                        ?.let(PlaybackUrl::sanitize),
                    isHdr = obj.optBoolean("isHdr", false),
                    dolbyVision = obj.optBoolean("dolbyVision", false),
                    handoff = obj.optBoolean("handoff", false),
                    sourceHeight = obj.optInt("sourceHeight", 0),
                    sourceWidth = obj.optInt("sourceWidth", 0),
                )
            } catch (_: Exception) {
                null
            }
        }
    }
}
