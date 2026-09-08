package com.media.app

/**
 * Pure loading hysteresis for [TimeBandLoadControl].
 *
 * Always fill until [minBufferUs]. Pause at [maxBufferUs], or earlier once the
 * min band is met and [allocatedBytes] hits [maxAllocatedBytes] (4K safety).
 */
object TimeBandLoadingPolicy {
    fun shouldContinueLoading(
        bufferedUs: Long,
        minBufferUs: Long,
        maxBufferUs: Long,
        allocatedBytes: Long,
        maxAllocatedBytes: Long,
        wasLoading: Boolean,
    ): Boolean {
        val minUs = maxOf(minBufferUs, 500_000L)
        return when {
            bufferedUs < minUs -> true
            bufferedUs >= maxBufferUs -> false
            maxAllocatedBytes > 0L && allocatedBytes >= maxAllocatedBytes -> false
            else -> wasLoading
        }
    }
}
