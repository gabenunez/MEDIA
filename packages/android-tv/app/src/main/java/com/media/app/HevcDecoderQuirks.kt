package com.media.app

/**
 * Some TV SoCs decode HEVC but deliver frames to the display on an uneven
 * cadence, producing visible stutter that no buffering or delivery change fixes.
 * Measured on a Hisense "songshan" (MStar m7632) panel: ~62ms avg / ~418ms max
 * flip gaps on 23.976fps HEVC, vs a clean ~41.7ms once transcoded to H.264.
 *
 * For these devices we route HEVC to an H.264 transcode instead of direct play.
 * Everything else keeps zero-CPU direct play, so this must stay a tight allowlist.
 */
object HevcDecoderQuirks {
    /** Lowercased Build.DEVICE / Build.BOARD / Build.PRODUCT values known to
     * judder on direct HEVC playback. */
    private val JUDDERY_DEVICES = setOf("songshan")
    private val JUDDERY_BOARDS = setOf("m7632", "his9612")

    fun isJudderyHevcDecoder(
        device: String?,
        board: String?,
        product: String?,
    ): Boolean {
        val d = device?.lowercase()?.trim()
        val b = board?.lowercase()?.trim()
        val p = product?.lowercase()?.trim()
        return (d != null && d in JUDDERY_DEVICES) ||
            (b != null && b in JUDDERY_BOARDS) ||
            (p != null && p in JUDDERY_DEVICES)
    }
}
