package com.media.app

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class TimeBandLoadingPolicyTest {
    @Test
    fun fillsUntilMinEvenWhenOverByteCap() {
        assertTrue(
            TimeBandLoadingPolicy.shouldContinueLoading(
                bufferedUs = 10_000_000L,
                minBufferUs = 20_000_000L,
                maxBufferUs = 40_000_000L,
                allocatedBytes = 400L * 1024L * 1024L,
                maxAllocatedBytes = 240L * 1024L * 1024L,
                wasLoading = false,
            ),
        )
    }

    @Test
    fun pausesAtMaxTime() {
        assertFalse(
            TimeBandLoadingPolicy.shouldContinueLoading(
                bufferedUs = 40_000_000L,
                minBufferUs = 20_000_000L,
                maxBufferUs = 40_000_000L,
                allocatedBytes = 50L * 1024L * 1024L,
                maxAllocatedBytes = 240L * 1024L * 1024L,
                wasLoading = true,
            ),
        )
    }

    @Test
    fun pausesAtByteCapOncePastMin() {
        assertFalse(
            TimeBandLoadingPolicy.shouldContinueLoading(
                bufferedUs = 25_000_000L,
                minBufferUs = 20_000_000L,
                maxBufferUs = 40_000_000L,
                allocatedBytes = 240L * 1024L * 1024L,
                maxAllocatedBytes = 240L * 1024L * 1024L,
                wasLoading = true,
            ),
        )
    }

    @Test
    fun keepsHysteresisBetweenMinAndMaxUnderByteCap() {
        assertTrue(
            TimeBandLoadingPolicy.shouldContinueLoading(
                bufferedUs = 25_000_000L,
                minBufferUs = 20_000_000L,
                maxBufferUs = 40_000_000L,
                allocatedBytes = 80L * 1024L * 1024L,
                maxAllocatedBytes = 240L * 1024L * 1024L,
                wasLoading = true,
            ),
        )
        assertFalse(
            TimeBandLoadingPolicy.shouldContinueLoading(
                bufferedUs = 25_000_000L,
                minBufferUs = 20_000_000L,
                maxBufferUs = 40_000_000L,
                allocatedBytes = 80L * 1024L * 1024L,
                maxAllocatedBytes = 240L * 1024L * 1024L,
                wasLoading = false,
            ),
        )
    }
}
