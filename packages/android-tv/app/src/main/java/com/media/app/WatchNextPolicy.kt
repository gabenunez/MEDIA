package com.media.app

/** Shared Watch Next / Play Next rules — keep one Continue Watching card per title. */
object WatchNextPolicy {
    const val COMPLETED_FRACTION = 0.95

    fun contentId(itemType: String, fileId: Int): String = "$itemType:$fileId"

    fun shouldRemove(ended: Boolean, positionMs: Long, durationMs: Long): Boolean {
        if (ended) return true
        if (durationMs <= 0L) return false
        return positionMs >= (durationMs * COMPLETED_FRACTION).toLong()
    }

    fun clampedPositionMs(positionMs: Long, durationMs: Long): Long {
        if (durationMs <= 1L) return 0L
        return positionMs.coerceAtLeast(0L).coerceAtMost(durationMs - 1L)
    }
}
