package com.media.app

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class DeviceBufferBudgetTest {
    @Test
    fun durationMsForBytesMatchesBitrateMath() {
        // 100 Mbps = 12_500_000 B/s → 125_000_000 bytes lasts exactly 10s
        assertEquals(
            10_000,
            DeviceBufferBudget.durationMsForBytes(125_000_000L, 100.0),
        )
    }

    @Test
    fun generousMemoryYieldsLargerUhdBudget() {
        // 45% of ~704MB heap headroom ≈ 317MB; 18% of 2GB system ≈ 369MB → min ≈ 317MB
        val profile =
            DeviceBufferBudget.resolve(
                maxHeapBytes = 768L * 1024L * 1024L,
                usedHeapBytes = 64L * 1024L * 1024L,
                availSystemBytes = 2L * 1024L * 1024L * 1024L,
                lowMemory = false,
                hls = false,
                uhd = true,
            )
        assertTrue(profile.targetBufferBytes >= 300 * 1024 * 1024)
        assertTrue(profile.minBufferMs < profile.maxBufferMs)
        val capacity =
            DeviceBufferBudget.durationMsForBytes(profile.targetBufferBytes.toLong(), 100.0)
        assertTrue(
            "min=${profile.minBufferMs} capacityAt100Mbps=$capacity",
            profile.minBufferMs < capacity,
        )
        assertTrue(profile.transferStallAheadMs < profile.minBufferMs)
    }

    @Test
    fun generousMemoryYieldsDeepHdBand() {
        val profile =
            DeviceBufferBudget.resolve(
                maxHeapBytes = 768L * 1024L * 1024L,
                usedHeapBytes = 64L * 1024L * 1024L,
                availSystemBytes = 2L * 1024L * 1024L * 1024L,
                lowMemory = false,
                hls = false,
                uhd = false,
            )
        assertTrue(profile.targetBufferBytes >= 300 * 1024 * 1024)
        // HD should keep a deep runway when memory allows (old fixed band was ~108s).
        assertTrue(profile.minBufferMs >= 60_000)
        val capacity =
            DeviceBufferBudget.durationMsForBytes(profile.targetBufferBytes.toLong(), 25.0)
        assertTrue(
            "min=${profile.minBufferMs} capacityAt25Mbps=$capacity",
            profile.minBufferMs < capacity,
        )
        assertTrue(profile.progressiveChunkBytes >= 4L * 1024L * 1024L)
        assertTrue(profile.transferStallAheadMs < profile.minBufferMs)
    }

    @Test
    fun lowMemoryCapsTheBudget() {
        val profile =
            DeviceBufferBudget.resolve(
                maxHeapBytes = 512L * 1024L * 1024L,
                usedHeapBytes = 64L * 1024L * 1024L,
                availSystemBytes = 2L * 1024L * 1024L * 1024L,
                lowMemory = true,
                hls = false,
                uhd = false,
            )
        assertEquals(DeviceBufferBudget.LOW_MEMORY_TARGET_BYTES.toInt(), profile.targetBufferBytes)
    }

    @Test
    fun tightMemoryStillMeetsFloorAndInvariant() {
        val profile =
            DeviceBufferBudget.resolve(
                maxHeapBytes = 256L * 1024L * 1024L,
                usedHeapBytes = 200L * 1024L * 1024L,
                availSystemBytes = 180L * 1024L * 1024L,
                lowMemory = false,
                hls = true,
                uhd = true,
            )
        assertEquals(DeviceBufferBudget.MIN_TARGET_BYTES.toInt(), profile.targetBufferBytes)
        val capacity =
            DeviceBufferBudget.durationMsForBytes(profile.targetBufferBytes.toLong(), 100.0)
        assertTrue(profile.minBufferMs < capacity)
        assertEquals(0L, profile.progressiveChunkBytes)
    }
}
