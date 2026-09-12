package com.media.app

import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/**
 * Derive ExoPlayer buffer limits from the TV's actual memory headroom instead of
 * fixed worst-case constants.
 *
 * ExoPlayer's allocator lives on the Java heap, so we blend:
 * - free heap under [maxHeapBytes]
 * - system [availSystemBytes] (so we don't starve SurfaceFlinger / WebView)
 *
 * Time bands are then derived from the byte budget so **min stays under** what
 * that budget holds at the tier's design bitrate (otherwise Range thrash returns).
 */
data class DeviceBufferProfile(
    val minBufferMs: Int,
    val maxBufferMs: Int,
    val bufferForPlaybackMs: Int,
    val bufferForPlaybackAfterRebufferMs: Int,
    val backBufferMs: Int,
    val targetBufferBytes: Int,
    val progressiveChunkBytes: Long,
    /** Ahead threshold for the transfer-stall watchdog (must sit below the min band). */
    val transferStallAheadMs: Long,
)

object DeviceBufferBudget {
    /** Floor — still enough for a short hysteresis band on weak devices. */
    const val MIN_TARGET_BYTES = 160L * 1024L * 1024L
    /** Cap — avoid recreating the old unbounded ~512MB path. */
    const val MAX_TARGET_BYTES = 384L * 1024L * 1024L
    /** When ActivityManager reports lowMemory, keep the ceiling tighter. */
    const val LOW_MEMORY_TARGET_BYTES = 192L * 1024L * 1024L

    private const val HEAP_HEADROOM_FRACTION = 0.45
    private const val SYSTEM_AVAIL_FRACTION = 0.18

    fun resolve(
        maxHeapBytes: Long,
        usedHeapBytes: Long,
        availSystemBytes: Long,
        lowMemory: Boolean,
        hls: Boolean,
        uhd: Boolean,
    ): DeviceBufferProfile {
        val heapHeadroom = (maxHeapBytes - usedHeapBytes).coerceAtLeast(0L)
        val fromHeap = (heapHeadroom.toDouble() * HEAP_HEADROOM_FRACTION).toLong()
        val fromSystem = (availSystemBytes.toDouble() * SYSTEM_AVAIL_FRACTION).toLong()

        var target =
            when {
                fromHeap <= 0L && fromSystem <= 0L -> MIN_TARGET_BYTES
                fromHeap <= 0L -> fromSystem
                fromSystem <= 0L -> fromHeap
                // Blend both signals — min() was so conservative that healthy
                // TVs still got a tiny forward band and an invisible scrubber.
                else -> (fromHeap + fromSystem) / 2L
            }
        target = target.coerceIn(MIN_TARGET_BYTES, MAX_TARGET_BYTES)
        if (lowMemory) {
            target = min(target, LOW_MEMORY_TARGET_BYTES)
        }

        return if (uhd) {
            resolveUhd(target, hls)
        } else {
            resolveHd(target, hls)
        }
    }

    /** Milliseconds of media [bytes] holds at [megabitsPerSecond]. */
    fun durationMsForBytes(bytes: Long, megabitsPerSecond: Double): Int {
        if (bytes <= 0L || megabitsPerSecond <= 0.0) return 0
        val bytesPerSecond = megabitsPerSecond * 1_000_000.0 / 8.0
        return ((bytes.toDouble() / bytesPerSecond) * 1000.0).roundToInt().coerceAtLeast(0)
    }

    private fun resolveUhd(target: Long, hls: Boolean): DeviceBufferProfile {
        // High 4K design bitrate — min must stay under this capacity.
        val capacityAt100Ms = durationMsForBytes(target, 100.0)
        val minMs =
            (capacityAt100Ms * 0.55)
                .roundToInt()
                .coerceIn(8_000, 28_000)
                .coerceAtMost(max(8_000, capacityAt100Ms - 4_000))
        val maxFromBudget = durationMsForBytes(target, 55.0)
        val maxMs =
            max(minMs + 12_000, maxFromBudget)
                .coerceIn(minMs + 8_000, 96_000)
        val backMs = (minMs * 0.45).roundToInt().coerceIn(4_000, 16_000)
        val chunk =
            when {
                target >= 320L * 1024L * 1024L -> 16L * 1024L * 1024L
                target >= 240L * 1024L * 1024L -> 12L * 1024L * 1024L
                else -> 8L * 1024L * 1024L
            }
        val stallAhead = min(8_000L, (minMs * 0.55).roundToInt().toLong()).coerceAtLeast(4_000L)

        return if (hls) {
            DeviceBufferProfile(
                minBufferMs = minMs,
                maxBufferMs = maxMs,
                bufferForPlaybackMs = 5_000,
                bufferForPlaybackAfterRebufferMs = 10_000,
                backBufferMs = max(backMs, 10_000),
                targetBufferBytes = target.toInt(),
                progressiveChunkBytes = 0L,
                transferStallAheadMs = stallAhead,
            )
        } else {
            DeviceBufferProfile(
                minBufferMs = minMs,
                maxBufferMs = maxMs,
                bufferForPlaybackMs = 2_500,
                bufferForPlaybackAfterRebufferMs = 5_000,
                backBufferMs = backMs,
                targetBufferBytes = target.toInt(),
                progressiveChunkBytes = chunk,
                transferStallAheadMs = stallAhead,
            )
        }
    }

    private fun resolveHd(target: Long, hls: Boolean): DeviceBufferProfile {
        // High 1080p design bitrate — keeps the old deep ~minute band when memory allows.
        val capacityAt25Ms = durationMsForBytes(target, 25.0)
        val minMs =
            (capacityAt25Ms * 0.72)
                .roundToInt()
                .coerceIn(36_000, 120_000)
                .coerceAtMost(max(36_000, capacityAt25Ms - 6_000))
        val maxFromBudget = durationMsForBytes(target, 10.0)
        val maxMs =
            max(minMs + 8_000, maxFromBudget)
                .coerceIn(minMs + 6_000, 180_000)
        val backMs =
            if (hls) {
                (minMs * 0.55).roundToInt().coerceIn(30_000, 90_000)
            } else {
                (minMs * 0.30).roundToInt().coerceIn(18_000, 45_000)
            }
        val chunk =
            when {
                target >= 320L * 1024L * 1024L -> 8L * 1024L * 1024L
                target >= 240L * 1024L * 1024L -> 6L * 1024L * 1024L
                else -> 4L * 1024L * 1024L
            }
        // Was 60s against ~110s min — keep ~55% of min so healthy HD isn't "always draining".
        val stallAhead =
            min(60_000L, (minMs * 0.55).roundToInt().toLong()).coerceAtLeast(20_000L)

        return if (hls) {
            DeviceBufferProfile(
                minBufferMs = minMs,
                maxBufferMs = maxMs,
                bufferForPlaybackMs = 5_000,
                bufferForPlaybackAfterRebufferMs = 10_000,
                backBufferMs = backMs,
                targetBufferBytes = target.toInt(),
                progressiveChunkBytes = 0L,
                transferStallAheadMs = stallAhead,
            )
        } else {
            DeviceBufferProfile(
                minBufferMs = minMs,
                maxBufferMs = maxMs,
                bufferForPlaybackMs = 2_500,
                bufferForPlaybackAfterRebufferMs = 5_000,
                backBufferMs = backMs,
                targetBufferBytes = target.toInt(),
                progressiveChunkBytes = chunk,
                transferStallAheadMs = stallAhead,
            )
        }
    }
}
