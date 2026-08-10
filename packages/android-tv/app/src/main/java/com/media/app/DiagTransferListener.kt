package com.media.app

import androidx.media3.datasource.DataSource
import androidx.media3.datasource.DataSpec
import androidx.media3.datasource.TransferListener
import java.util.concurrent.ConcurrentHashMap

/**
 * Logs progressive/HLS HTTP transfer open/close with Range offsets and measured
 * throughput. Quiet on byte ticks — only start/end/error.
 */
class DiagTransferListener : TransferListener {
    private data class OpenTransfer(
        val startedAtMs: Long,
        val position: Long,
        val length: Long,
        val uri: String,
    )

    private val open = ConcurrentHashMap<DataSource, OpenTransfer>()
    private val bytesBySource = ConcurrentHashMap<DataSource, Long>()

    @Volatile var openTransferCount: Int = 0
        private set
    @Volatile var bytesInFlight: Long = 0L
        private set
    @Volatile var lastByteAtMs: Long = 0L
        private set

    override fun onTransferInitializing(
        source: DataSource,
        dataSpec: DataSpec,
        isNetwork: Boolean,
    ) {
        // no-op — wait for onTransferStart once the connection is open
    }

    override fun onTransferStart(
        source: DataSource,
        dataSpec: DataSpec,
        isNetwork: Boolean,
    ) {
        if (!isNetwork) return
        val uri = dataSpec.uri.toString()
        open[source] =
            OpenTransfer(
                startedAtMs = System.currentTimeMillis(),
                position = dataSpec.position,
                length = dataSpec.length,
                uri = uri,
            )
        bytesBySource[source] = 0L
        openTransferCount = open.size
        lastByteAtMs = System.currentTimeMillis()
        PlaybackDiag.onTransferStart(uri, dataSpec.position, dataSpec.length)
    }

    override fun onBytesTransferred(
        source: DataSource,
        dataSpec: DataSpec,
        isNetwork: Boolean,
        bytesTransferred: Int,
    ) {
        if (!isNetwork || bytesTransferred <= 0) return
        bytesBySource.merge(source, bytesTransferred.toLong()) { a, b -> a + b }
        bytesInFlight = bytesBySource.values.sum()
        lastByteAtMs = System.currentTimeMillis()
        PlaybackDiag.noteTransferProgress(bytesTransferred.toLong())
    }

    override fun onTransferEnd(
        source: DataSource,
        dataSpec: DataSpec,
        isNetwork: Boolean,
    ) {
        if (!isNetwork) return
        val meta = open.remove(source)
        val bytes = bytesBySource.remove(source) ?: 0L
        openTransferCount = open.size
        bytesInFlight = bytesBySource.values.sum()
        val elapsed = if (meta != null) {
            (System.currentTimeMillis() - meta.startedAtMs).coerceAtLeast(0L)
        } else {
            0L
        }
        PlaybackDiag.onTransferEnd(bytes, elapsed)
    }

    fun noteError(source: DataSource?, message: String) {
        val meta = if (source != null) open.remove(source) else null
        val bytes = if (source != null) bytesBySource.remove(source) ?: 0L else 0L
        if (source != null) {
            openTransferCount = open.size
            bytesInFlight = bytesBySource.values.sum()
        }
        val elapsed = if (meta != null) {
            (System.currentTimeMillis() - meta.startedAtMs).coerceAtLeast(0L)
        } else {
            0L
        }
        PlaybackDiag.onTransferError(message, bytes, elapsed)
    }
}
