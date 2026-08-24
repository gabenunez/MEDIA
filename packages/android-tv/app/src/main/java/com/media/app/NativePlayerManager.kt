package com.media.app

import android.graphics.Color
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.MimeTypes
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.VideoSize
import androidx.media3.common.text.Cue
import androidx.media3.effect.Presentation
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.analytics.AnalyticsListener
import androidx.media3.ui.AspectRatioFrameLayout
import androidx.media3.ui.PlayerView
import androidx.media3.ui.SubtitleView
import org.json.JSONObject
import java.util.concurrent.Executors

class NativePlayerManager(
    private val playerView: PlayerView,
    private val emitJs: (String) -> Unit,
    private val onPlaybackStopped: () -> Unit = {},
    private val onHdrContentChanged: (Boolean) -> Unit = {},
    private val watchNextManager: WatchNextManager? = null,
) {
    private val handler = Handler(Looper.getMainLooper())
    private var player: ExoPlayer? = null
    private var seekApplied = false
    private var serverUrl: String = ""
    private var sessionToken: String? = null
    private var currentPayload: PlaybackPayload? = null
    private var mediaSessionManager: PlaybackMediaSessionManager? = null
    private var displayMode: String = "fit"
    private var hdrContentActive = false
    private var subtitleStylesJson: String? = null
    private var lastWatchNextUpdateMs = 0L
    private var playbackEnded = false
    private var lastPlaybackPositionMs = 0L
    private var lastPlaybackProgressAtMs = 0L
    private var stallRecoveryAttempts = 0
    private var stallRecoveryPending = false
    private var playbackFailureReported = false
    private var hasReachedReady = false
    /** One local seek+prepare before failing through mid-play. */
    private var didAttemptSoftStallRecovery = false
    private var stallRecoveryRunnable: Runnable? = null
    private var seekCoalesceRunnable: Runnable? = null
    private var pendingSeekMs: Long? = null
    /** Wall clock of the last user scrub/skip — suppresses stall recovery while refilling. */
    private var lastUserSeekAtMs = 0L
    /** Latch so we only enable the GPU upscale graph once per play session. */
    private var sdUpscaleApplied = false
    /** Was ExoPlayer in STATE_BUFFERING on the previous progress tick. */
    private var wasBuffering = false
    /** Timestamps of mid-playback rebuffer starts (after first READY). */
    private val midRebufferAtMs = ArrayDeque<Long>()
    private var activeLoadControl: TimeBandLoadControl? = null
    private var transferListener: DiagTransferListener? = null
    private var lastBandwidthEstimate: Long = 0L
    private var lastEmittedPlaybackState: Int = Player.STATE_IDLE
    /** Wall clock when ahead started draining with no HTTP byte progress. */
    private var transferStallSinceMs = 0L
    private var overlaySubtitleView: SubtitleView? = null
    private var overlayCues: List<WebVttCue> = emptyList()
    private var lastOverlayTexts: List<String> = emptyList()
    private var subtitleLoadGeneration = 0
    private val subtitleExecutor = Executors.newSingleThreadExecutor()

    /** When true, JS chrome is hidden — emit progress less often to cut WebView work. */
    private var uiOverlayVisible = true

    private val progressRunnable = object : Runnable {
        override fun run() {
            emitState()
            paintOverlayCues()
            val interval =
                if (uiOverlayVisible) PROGRESS_INTERVAL_MS else PROGRESS_INTERVAL_HIDDEN_MS
            handler.postDelayed(this, interval)
        }
    }

    private val cueRunnable = object : Runnable {
        override fun run() {
            paintOverlayCues()
            handler.postDelayed(this, CUE_INTERVAL_MS)
        }
    }

    fun setUiOverlayVisible(visible: Boolean) {
        uiOverlayVisible = visible
    }

    fun play(serverUrl: String, sessionToken: String?, payload: PlaybackPayload) {
        this.serverUrl = serverUrl
        this.sessionToken = sessionToken
        currentPayload = payload
        seekApplied = false
        lastWatchNextUpdateMs = 0L
        playbackEnded = false
        lastPlaybackPositionMs = 0L
        lastPlaybackProgressAtMs = System.currentTimeMillis()
        stallRecoveryAttempts = 0
        stallRecoveryPending = false
        playbackFailureReported = false
        hasReachedReady = false
        didAttemptSoftStallRecovery = false
        pendingSeekMs = null
        lastUserSeekAtMs = 0L
        sdUpscaleApplied = false
        wasBuffering = false
        midRebufferAtMs.clear()
        lastBandwidthEstimate = 0L
        lastEmittedPlaybackState = Player.STATE_IDLE
        transferStallSinceMs = 0L
        cancelSeekCoalesce()
        cancelStallRecovery()

        releasePlayer()
        playerView.visibility = View.VISIBLE

        val diagTransfers = DiagTransferListener()
        transferListener = diagTransfers
        // Progressive: clamp each Range to 4MB so a hung socket cannot drain the
        // ~110s buffer (see 1.5.14 logs: one len=-1 transfer open for 508s).
        // HLS segments are already bounded — leave them unchunked.
        val mediaSourceFactory =
            authenticatedMediaSourceFactory(
                sessionToken = sessionToken,
                transferListener = diagTransfers,
                chunkBytes = if (payload.isHls) 0L else PROGRESSIVE_HTTP_CHUNK_BYTES,
            )
        // Time-band LoadControl (see TimeBandLoadControl): fill to max, pause
        // until min, refill. DefaultLoadControl also stops when the byte target
        // is hit once buffered>=min — that collapsed this band into min-watermark
        // Range thrash on high-bitrate progressive (mid-play BUFFERING on a
        // stable LAN). TimeBandLoadControl only pauses at maxBufferMs.
        val loadControl =
            if (payload.isHls) {
                TimeBandLoadControl.create(
                    HLS_MIN_BUFFER_MS,
                    HLS_MAX_BUFFER_MS,
                    HLS_BUFFER_FOR_PLAYBACK_MS,
                    HLS_BUFFER_FOR_PLAYBACK_AFTER_REBUFFER_MS,
                    HLS_TARGET_BUFFER_BYTES,
                    HLS_BACK_BUFFER_MS,
                )
            } else {
                TimeBandLoadControl.create(
                    PROGRESSIVE_MIN_BUFFER_MS,
                    PROGRESSIVE_MAX_BUFFER_MS,
                    PROGRESSIVE_BUFFER_FOR_PLAYBACK_MS,
                    PROGRESSIVE_BUFFER_FOR_PLAYBACK_AFTER_REBUFFER_MS,
                    PROGRESSIVE_TARGET_BUFFER_BYTES,
                    PROGRESSIVE_BACK_BUFFER_MS,
                )
            }
        activeLoadControl = loadControl
        val exoPlayer =
            ExoPlayer.Builder(playerView.context)
                .setMediaSourceFactory(mediaSourceFactory)
                .setLoadControl(loadControl)
                .build()

        player = exoPlayer
        playerView.player = exoPlayer
        playerView.useController = false
        playerView.setShutterBackgroundColor(Color.TRANSPARENT)
        playerView.subtitleView?.visibility = View.GONE
        ensureOverlaySubtitleView()
        applyStoredSubtitleStyles()
        exoPlayer.trackSelectionParameters =
            exoPlayer.trackSelectionParameters
                .buildUpon()
                .setTrackTypeDisabled(C.TRACK_TYPE_TEXT, true)
                .build()
        // Engage HDR window color mode before prepare so the first frame is
        // already presented on an HDR surface (late flips often stay SDR).
        if (payload.isHdr || payload.dolbyVision) {
            setHdrContentActive(true)
        }
        mediaSessionManager?.release()
        mediaSessionManager = PlaybackMediaSessionManager(playerView.context, exoPlayer)

        PlaybackDiag.beginSession(
            fileId = payload.fileId,
            isHls = payload.isHls,
            url = payload.url,
            startSeconds = payload.startSeconds,
            durationMs = payload.durationMs,
            apkVersion = apkVersionName(),
        )

        exoPlayer.setMediaItem(buildMediaItem(payload))
        exoPlayer.prepare()
        exoPlayer.playWhenReady = true

        exoPlayer.addAnalyticsListener(
            object : AnalyticsListener {
                override fun onBandwidthEstimate(
                    eventTime: AnalyticsListener.EventTime,
                    totalLoadTimeMs: Int,
                    totalBytesLoaded: Long,
                    bitrateEstimate: Long,
                ) {
                    lastBandwidthEstimate = bitrateEstimate
                }

                override fun onLoadError(
                    eventTime: AnalyticsListener.EventTime,
                    loadEventInfo: androidx.media3.exoplayer.source.LoadEventInfo,
                    mediaLoadData: androidx.media3.exoplayer.source.MediaLoadData,
                    error: java.io.IOException,
                    wasCanceled: Boolean,
                ) {
                    PlaybackDiag.onTransferError(
                        "${error.javaClass.simpleName}:${error.message ?: "-"} canceled=$wasCanceled",
                        loadEventInfo.bytesLoaded,
                        loadEventInfo.loadDurationMs,
                    )
                }
            },
        )

        exoPlayer.addListener(
            object : Player.Listener {
                override fun onPlaybackStateChanged(playbackState: Int) {
                    when (playbackState) {
                        Player.STATE_READY -> {
                            hasReachedReady = true
                            if (!payload.isHls && payload.startSeconds > 0 && !seekApplied) {
                                val startMs = (payload.startSeconds * 1000).toLong()
                                markPlaybackProgress(startMs)
                                exoPlayer.seekTo(startMs)
                                seekApplied = true
                            }
                            updateHdrOutput(exoPlayer)
                            applySdUpscaleEffect(exoPlayer)
                            applyDisplayMode()
                            applyStoredSubtitleStyles()
                            playerView.subtitleView?.visibility = View.GONE
                            emitState()
                        }

                        Player.STATE_ENDED -> {
                            playbackEnded = true
                            saveProgress(exoPlayer.duration, ended = true)
                            emitJs("window.__mediaNativePlayer?.onEnded?.()")
                            stop()
                        }

                        else -> emitState()
                    }
                }

                override fun onIsPlayingChanged(isPlaying: Boolean) {
                    emitState()
                }

                override fun onTracksChanged(tracks: androidx.media3.common.Tracks) {
                    playerView.subtitleView?.visibility = View.GONE
                    applyStoredSubtitleStyles()
                    paintOverlayCues()
                    emitState()
                }

                override fun onVideoSizeChanged(videoSize: VideoSize) {
                    updateHdrOutput(exoPlayer)
                    applySdUpscaleEffect(exoPlayer)
                    applyDisplayMode()
                }

                override fun onPlayerError(error: PlaybackException) {
                    Log.e(
                        TAG,
                        "ExoPlayer error code=${error.errorCode} (${error.errorCodeName}) url=${payload.url}",
                        error,
                    )
                    PlaybackDiag.onPlayerError(
                        error.errorCode,
                        error.errorCodeName,
                        error.message,
                        bufferAheadMs(exoPlayer),
                    )
                    // Permanent failures (HTTP 4xx, unsupported container, decoder
                    // init) should hand off to the web remux/HLS ladder immediately
                    // instead of burning local seek+prepare retries.
                    if (!isTransientPlaybackError(error) ||
                        !schedulePlaybackRecovery(exoPlayer, "error", maxAttempts = 1)
                    ) {
                        reportPlaybackFailure("player-error:${error.errorCodeName}")
                    }
                    emitState()
                }
            },
        )

        handler.removeCallbacks(progressRunnable)
        handler.post(progressRunnable)
        handler.removeCallbacks(cueRunnable)
        handler.post(cueRunnable)
        if (!payload.subtitleUrl.isNullOrBlank()) {
            updateSubtitles(payload.subtitleUrl)
        }
    }

    fun pause() {
        player?.pause()
        lastPlaybackProgressAtMs = System.currentTimeMillis()
        emitState()
    }

    fun isPlaying(): Boolean = player?.isPlaying == true

    fun isActive(): Boolean = playerView.visibility == View.VISIBLE && player != null

    fun togglePlayPause() {
        val exoPlayer = player ?: return
        if (exoPlayer.isPlaying) {
            exoPlayer.pause()
        } else {
            exoPlayer.play()
        }
        emitState()
    }

    fun currentPositionMs(): Long = player?.currentPosition ?: 0L

    fun resume() {
        val exoPlayer = player ?: return
        lastPlaybackProgressAtMs = System.currentTimeMillis()
        // After a permanent error ExoPlayer sits in IDLE; play() alone is a no-op
        // until prepare() rebuilds the pipeline — that felt like a stuck "pause".
        if (exoPlayer.playerError != null || exoPlayer.playbackState == Player.STATE_IDLE) {
            exoPlayer.prepare()
        }
        exoPlayer.play()
        emitState()
    }

    fun syncPlaybackState() {
        emitState()
    }

    fun seekTo(positionMs: Long) {
        // Coalesce rapid skip taps (-10 / +30) so each tap does not cancel the
        // previous Range/segment refill — that is what felt "laggy" after skipping.
        pendingSeekMs = positionMs.coerceAtLeast(0L)
        cancelSeekCoalesce()
        val runnable = Runnable {
            seekCoalesceRunnable = null
            val target = pendingSeekMs ?: return@Runnable
            pendingSeekMs = null
            dispatchUserSeek(target)
        }
        seekCoalesceRunnable = runnable
        handler.postDelayed(runnable, SEEK_COALESCE_MS)
    }

    private fun dispatchUserSeek(targetMs: Long) {
        val exoPlayer = player ?: return
        // Cancel any in-flight soft recovery — a delayed seek+prepare after a
        // user scrub destroys the new buffer window and leaves playback choppy.
        cancelStallRecovery()
        didAttemptSoftStallRecovery = false
        lastUserSeekAtMs = System.currentTimeMillis()
        PlaybackDiag.onSeek(
            targetMs = targetMs,
            fromMs = exoPlayer.currentPosition,
            aheadMs = bufferAheadMs(exoPlayer),
        )
        markPlaybackProgress(targetMs)
        exoPlayer.seekTo(targetMs)
        exoPlayer.playWhenReady = true
        emitState()
    }

    private fun cancelSeekCoalesce() {
        seekCoalesceRunnable?.let { handler.removeCallbacks(it) }
        seekCoalesceRunnable = null
    }

    fun updateSubtitles(subtitleUrl: String?): Boolean {
        val exoPlayer = player ?: return false
        val payload = currentPayload ?: return false

        val normalizedUrl = subtitleUrl?.takeIf { it.isNotBlank() }
        currentPayload = payload.copy(subtitleUrl = normalizedUrl)
        exoPlayer.trackSelectionParameters =
            exoPlayer.trackSelectionParameters
                .buildUpon()
                .setTrackTypeDisabled(C.TRACK_TYPE_TEXT, true)
                .build()

        if (normalizedUrl == null) {
            subtitleLoadGeneration += 1
            overlayCues = emptyList()
            lastOverlayTexts = emptyList()
            overlaySubtitleView?.setCues(emptyList())
            return true
        }

        val generation = ++subtitleLoadGeneration
        subtitleExecutor.execute {
            val text = fetchSubtitleText(normalizedUrl)
            handler.post {
                if (generation != subtitleLoadGeneration) return@post
                if (text.isNullOrBlank()) return@post
                overlayCues = WebVttCueParser.parse(text)
                lastOverlayTexts = emptyList()
                paintOverlayCues()
            }
        }
        return true
    }

    fun setSubtitleVtt(vtt: String): Boolean {
        player ?: return false
        currentPayload ?: return false
        ensureOverlaySubtitleView()
        subtitleLoadGeneration += 1
        overlayCues = WebVttCueParser.parse(vtt)
        lastOverlayTexts = emptyList()
        paintOverlayCues()
        return true
    }

    fun applySubtitleStyles(json: String): Boolean {
        subtitleStylesJson = json
        applyStoredSubtitleStyles()
        return true
    }

    private fun applyStoredSubtitleStyles(): Boolean {
        val json = subtitleStylesJson ?: return false
        return SubtitleStyleMapper.apply(overlaySubtitleView ?: playerView.subtitleView, json)
    }

    fun stop() {
        handler.removeCallbacks(progressRunnable)
        handler.removeCallbacks(cueRunnable)
        cancelSeekCoalesce()
        cancelStallRecovery()
        pendingSeekMs = null
        if (!playbackEnded) {
            saveProgress(player?.currentPosition ?: 0L, ended = false)
        }
        if (currentPayload != null) {
            PlaybackDiag.endSession(if (playbackEnded) "ended" else "stop")
        }
        setHdrContentActive(false)
        releasePlayer()
        activeLoadControl = null
        transferListener = null
        playerView.visibility = View.GONE
        playerView.scaleX = 1f
        playerView.scaleY = 1f
        currentPayload = null
        playbackEnded = false
        stallRecoveryPending = false
        playbackFailureReported = false
        hasReachedReady = false
        sdUpscaleApplied = false
        onPlaybackStopped()
    }

    fun setDisplayMode(mode: String) {
        displayMode =
            when (mode) {
                "fill", "stretch" -> mode
                else -> "fit"
            }
        applyDisplayMode()
    }

    private fun applySdUpscaleEffect(exoPlayer: ExoPlayer) {
        // Media3's setVideoEffects() switches rendering onto the GPU video-graph
        // path, which tone-maps HDR/DV to SDR on most Android TV SoCs. Never
        // touch effects for HDR content — and never call setVideoEffects with
        // an empty list as a "no-op", since that still enables the graph.
        if (sdUpscaleApplied || isHdrPayload() || hdrContentActive) {
            return
        }

        val sourceH = exoPlayer.videoSize.height
        if (sourceH <= 0) return

        val metrics = playerView.context.resources.displayMetrics
        val screenMax = maxOf(metrics.widthPixels, metrics.heightPixels)
        if (screenMax < 2160 || sourceH > 576) {
            return
        }

        // Upscale SD to 720p in the GPU pipeline before the display scaler — softer on 4K TVs.
        val targetH = 720
        if (sourceH >= targetH) {
            return
        }

        exoPlayer.setVideoEffects(listOf(Presentation.createForHeight(targetH)))
        sdUpscaleApplied = true
    }

    private fun applyDisplayMode() {
        playerView.scaleX = 1f
        playerView.scaleY = 1f
        playerView.pivotX = playerView.width / 2f
        playerView.pivotY = playerView.height / 2f

        when (displayMode) {
            "fill" -> playerView.resizeMode = AspectRatioFrameLayout.RESIZE_MODE_ZOOM
            "stretch" -> {
                playerView.resizeMode = AspectRatioFrameLayout.RESIZE_MODE_FIT
                playerView.post { applyStretchScale() }
            }
            else -> playerView.resizeMode = AspectRatioFrameLayout.RESIZE_MODE_FIT
        }
    }

    private fun applyStretchScale() {
        val exoPlayer = player ?: return
        val videoSize = exoPlayer.videoSize
        if (videoSize.width <= 0 || videoSize.height <= 0) return

        val containerW = playerView.width.toFloat()
        val containerH = playerView.height.toFloat()
        if (containerW <= 0f || containerH <= 0f) return

        val videoAspect =
            videoSize.width.toFloat() * videoSize.pixelWidthHeightRatio / videoSize.height.toFloat()
        val containerAspect = containerW / containerH

        val fittedW: Float
        val fittedH: Float
        if (videoAspect > containerAspect) {
            fittedW = containerW
            fittedH = containerW / videoAspect
        } else {
            fittedH = containerH
            fittedW = containerH * videoAspect
        }

        playerView.scaleX = containerW / fittedW
        playerView.scaleY = containerH / fittedH
    }

    fun release() {
        handler.removeCallbacks(progressRunnable)
        handler.removeCallbacks(cueRunnable)
        releasePlayer()
        playerView.visibility = View.GONE
    }

    private fun releasePlayer() {
        mediaSessionManager?.release()
        mediaSessionManager = null
        playerView.player = null
        player?.release()
        player = null
        overlayCues = emptyList()
        lastOverlayTexts = emptyList()
        overlaySubtitleView?.setCues(emptyList())
    }

    private fun isHdrPayload(): Boolean {
        val payload = currentPayload ?: return false
        return payload.isHdr || payload.dolbyVision
    }

    private fun isHdrFormat(exoPlayer: ExoPlayer): Boolean {
        // Server probe is authoritative. ExoPlayer ColorInfo is often missing
        // or incomplete for MKV HDR10 (transfer stays UNSPECIFIED), and a
        // false "SDR" reading would flip the window out of COLOR_MODE_HDR.
        if (isHdrPayload()) return true

        val format = exoPlayer.videoFormat ?: return hdrContentActive

        // Dolby Vision sample MIME (dvhe/dvh1) — engage HDR output.
        if (format.sampleMimeType == MimeTypes.VIDEO_DOLBY_VISION) return true

        val colorInfo = format.colorInfo ?: return hdrContentActive
        return when (colorInfo.colorTransfer) {
            C.COLOR_TRANSFER_ST2084, C.COLOR_TRANSFER_HLG -> true
            else -> false
        }
    }

    private fun updateHdrOutput(exoPlayer: ExoPlayer) {
        if (exoPlayer.playbackState != Player.STATE_READY) return
        // Only ever promote to HDR from the decoder; never demote a payload
        // that already declared HDR/DV (incomplete ColorInfo must not win).
        if (isHdrFormat(exoPlayer)) {
            setHdrContentActive(true)
        }
    }

    private fun setHdrContentActive(active: Boolean) {
        if (hdrContentActive == active) return
        hdrContentActive = active
        onHdrContentChanged(active)
    }

    private fun ensureOverlaySubtitleView(): SubtitleView {
        overlaySubtitleView?.let { return it }
        val view = SubtitleView(playerView.context)
        val parent: ViewGroup = playerView.overlayFrameLayout ?: playerView
        parent.addView(
            view,
            FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT,
            ),
        )
        overlaySubtitleView = view
        applyStoredSubtitleStyles()
        return view
    }

    private fun paintOverlayCues() {
        val view = overlaySubtitleView ?: return
        val timeSeconds = (player?.currentPosition ?: 0L) / 1000.0
        val texts = WebVttCueParser.activeTexts(overlayCues, timeSeconds)
        if (texts == lastOverlayTexts) return
        lastOverlayTexts = texts
        view.setCues(texts.map { Cue.Builder().setText(it).build() })
    }

    private fun fetchSubtitleText(url: String): String? {
        return try {
            val connection = java.net.URL(url).openConnection() as java.net.HttpURLConnection
            connection.connectTimeout = 8_000
            connection.readTimeout = 8_000
            connection.instanceFollowRedirects = true
            if (!sessionToken.isNullOrBlank()) {
                connection.setRequestProperty(
                    "Cookie",
                    "media_session=$sessionToken; reel_session=$sessionToken",
                )
            }
            connection.inputStream.bufferedReader().use { it.readText() }
        } catch (err: Exception) {
            Log.w(TAG, "subtitle fetch failed: ${err.message}")
            null
        }
    }

    private fun buildMediaItem(request: PlaybackPayload): MediaItem {
        val builder = MediaItem.Builder()
            .setUri(request.url)
            .setMediaMetadata(
                MediaMetadata.Builder()
                    .setTitle(request.title)
                    .build(),
            )

        mimeTypeForUrl(request.url)?.let { builder.setMimeType(it) }

        return builder.build()
    }

    private fun mimeTypeForUrl(url: String): String? {
        val path = url.substringBefore('?').substringBefore('#').lowercase()
        return when {
            path.endsWith(".mkv") -> MimeTypes.VIDEO_MATROSKA
            path.endsWith(".webm") -> MimeTypes.VIDEO_WEBM
            path.endsWith(".mp4") || path.endsWith(".m4v") -> MimeTypes.VIDEO_MP4
            path.endsWith(".mov") -> MimeTypes.VIDEO_MP4
            path.endsWith(".ts") || path.endsWith(".m2ts") || path.endsWith(".mts") ->
                MimeTypes.VIDEO_MP2T
            path.contains(".m3u8") -> MimeTypes.APPLICATION_M3U8
            else -> null
        }
    }

    private fun emitState() {
        val exoPlayer = player ?: return
        val now = System.currentTimeMillis()
        val currentPositionMs = exoPlayer.currentPosition
        val playbackState = exoPlayer.playbackState
        val buffering = playbackState == Player.STATE_BUFFERING
        val stalledClockMs = now - lastPlaybackProgressAtMs
        val aheadMs = bufferAheadMs(exoPlayer)
        val allocBytes = activeLoadControl?.allocatedBytes() ?: 0L

        // Viewer wants play but the pipeline went IDLE (error cleared poorly,
        // or a subtitle swap left us unprepared) — rebuild instead of spinning.
        if (
            !playbackFailureReported &&
            exoPlayer.playWhenReady &&
            playbackState == Player.STATE_IDLE &&
            exoPlayer.playerError == null
        ) {
            Log.w(TAG, "playWhenReady with IDLE — re-preparing")
            PlaybackDiag.event("IDLE_REPREPARE", "posMs" to currentPositionMs, "aheadMs" to aheadMs)
            exoPlayer.prepare()
            exoPlayer.playWhenReady = true
        }

        if (currentPositionMs > lastPlaybackPositionMs + 200L) {
            markPlaybackProgress(currentPositionMs)
            stallRecoveryAttempts = 0
            didAttemptSoftStallRecovery = false
        } else if (!playbackFailureReported && exoPlayer.playWhenReady) {
            handlePlaybackStall(exoPlayer, buffering, playbackState, stalledClockMs)
        }

        if (playbackState != lastEmittedPlaybackState) {
            PlaybackDiag.onStateChanged(
                playbackStateName(playbackState),
                currentPositionMs,
                aheadMs,
                exoPlayer.isPlaying,
            )
            lastEmittedPlaybackState = playbackState
        }

        // Brief underruns that recover never trip the hard stall timer. Count
        // mid-play rebuffer starts and fail through after a cluster of them.
        if (
            !playbackFailureReported &&
            hasReachedReady &&
            exoPlayer.playWhenReady &&
            buffering &&
            !wasBuffering
        ) {
            val seekAgeMs =
                if (lastUserSeekAtMs > 0L) now - lastUserSeekAtMs else -1L
            PlaybackDiag.onBufferingStart(
                posMs = currentPositionMs,
                aheadMs = aheadMs,
                bufferedMs = exoPlayer.bufferedPosition,
                totalBufferedMs = exoPlayer.totalBufferedDuration.coerceAtLeast(0L),
                playWhenReady = exoPlayer.playWhenReady,
                isPlaying = exoPlayer.isPlaying,
                seekAgeMs = seekAgeMs,
                allocatedBytes = allocBytes,
                videoH = exoPlayer.videoSize.height,
                bitrateEstimate = lastBandwidthEstimate,
            )
            Log.w(
                TAG,
                "Mid-playback BUFFERING aheadMs=$aheadMs posMs=$currentPositionMs " +
                    "bufferedMs=${exoPlayer.bufferedPosition} state=$playbackState",
            )
            noteMidPlaybackRebuffer(now)
        } else if (wasBuffering && !buffering) {
            PlaybackDiag.onBufferingEnd(currentPositionMs, aheadMs)
        }
        wasBuffering = buffering

        if (hasReachedReady) {
            maybeRecoverStalledTransfer(exoPlayer, now, aheadMs, buffering)
            PlaybackDiag.maybeHealth(
                nowMs = now,
                posMs = currentPositionMs,
                aheadMs = aheadMs,
                isPlaying = exoPlayer.isPlaying,
                buffering = buffering,
                allocatedBytes = allocBytes,
                bitrateEstimate = lastBandwidthEstimate,
            )
        }

        val durationMs = when {
            exoPlayer.duration > 0 -> exoPlayer.duration
            (currentPayload?.durationMs ?: 0L) > 0 -> currentPayload!!.durationMs
            else -> 0L
        }

        val payload = JSONObject()
            .put("currentTime", exoPlayer.currentPosition / 1000.0)
            .put("duration", durationMs / 1000.0)
            .put("buffered", exoPlayer.bufferedPosition / 1000.0)
            .put("bufferedRanges", buildBufferedRanges(exoPlayer))
            .put("isPlaying", exoPlayer.isPlaying)
            .put("isBuffering", buffering)
            // Sticky: web treats ready&&buffering as "mid-playback rebuffer".
            // ExoPlayer STATE_READY and STATE_BUFFERING are mutually exclusive,
            // so a momentary ready flag made mid-buffer UI impossible.
            .put("ready", hasReachedReady)

        if (System.currentTimeMillis() - lastWatchNextUpdateMs >= WATCH_NEXT_UPDATE_INTERVAL_MS) {
            currentPayload?.let {
                watchNextManager?.update(it, exoPlayer.currentPosition, durationMs)
            }
            lastWatchNextUpdateMs = System.currentTimeMillis()
        }

        emitJs("window.__mediaNativePlayer?.onState?.($payload)")
    }

    /**
     * Mid-play hangs used to sit in BUFFERING for 45s (or forever if the stall
     * clock was reset / state was READY-but-frozen). Recover locally once, then
     * fail through quickly so remux/HLS can take over.
     *
     * Never soft-recover in the post-seek refill window — that cancels the new
     * progressive Range / HLS fetch and leaves playback laggy after skip/scrub.
     * Keep in sync with resolveSeekStallWatchdogAction() in playback-utils.ts.
     */
    private fun handlePlaybackStall(
        exoPlayer: ExoPlayer,
        buffering: Boolean,
        playbackState: Int,
        stalledClockMs: Long,
    ) {
        val frozenReady =
            hasReachedReady &&
                playbackState == Player.STATE_READY &&
                !exoPlayer.isPlaying &&
                !buffering
        val stuckBuffering = buffering
        if (!frozenReady && !stuckBuffering) return

        val now = System.currentTimeMillis()
        if (lastUserSeekAtMs > 0L && now - lastUserSeekAtMs < SEEK_STALL_SUPPRESS_MS) {
            return
        }

        val softAfter = if (hasReachedReady) MID_PLAY_SOFT_RECOVERY_MS else Long.MAX_VALUE
        val failAfter = stallTimeoutMs()

        if (stalledClockMs >= softAfter && !didAttemptSoftStallRecovery && !stallRecoveryPending) {
            didAttemptSoftStallRecovery = true
            Log.w(
                TAG,
                "Soft stall recovery after ${stalledClockMs}ms buffering=$buffering state=$playbackState",
            )
            PlaybackDiag.onStall(
                "soft-recover",
                stalledClockMs,
                buffering,
                playbackStateName(playbackState),
                bufferAheadMs(exoPlayer),
            )
            if (schedulePlaybackRecovery(exoPlayer, "stall-soft", maxAttempts = 1)) {
                return
            }
        }

        if (stalledClockMs < failAfter) return

        Log.w(
            TAG,
            "Playback stall after ${stalledClockMs}ms (limit=${failAfter}ms) buffering=$buffering state=$playbackState — failing through",
        )
        PlaybackDiag.onStall(
            "fail-through",
            stalledClockMs,
            buffering,
            playbackStateName(playbackState),
            bufferAheadMs(exoPlayer),
        )
        reportPlaybackFailure("stall-timeout")
    }

    private fun stallTimeoutMs(): Long {
        if (hasReachedReady) return MID_PLAY_STALL_TIMEOUT_MS
        // Mid-title remux/HLS restarts already have a playhead — don't wait 90s.
        val midPlayRestart = (currentPayload?.startSeconds ?: 0.0) > 1.0
        return if (midPlayRestart) MID_PLAY_START_GRACE_MS else INITIAL_BUFFER_GRACE_MS
    }

    private fun markPlaybackProgress(positionMs: Long) {
        lastPlaybackPositionMs = positionMs.coerceAtLeast(0L)
        lastPlaybackProgressAtMs = System.currentTimeMillis()
    }

    private fun noteMidPlaybackRebuffer(nowMs: Long) {
        midRebufferAtMs.addLast(nowMs)
        while (
            midRebufferAtMs.isNotEmpty() &&
            nowMs - midRebufferAtMs.first() > REBUFFER_ESCALATION_WINDOW_MS
        ) {
            midRebufferAtMs.removeFirst()
        }
        if (midRebufferAtMs.size < REBUFFER_ESCALATION_COUNT) return

        Log.w(
            TAG,
            "Repeated mid-playback rebuffers (${midRebufferAtMs.size} in ${REBUFFER_ESCALATION_WINDOW_MS}ms) — failing through to remux/HLS",
        )
        reportPlaybackFailure("rebuffer-cluster")
    }

    private fun cancelStallRecovery() {
        stallRecoveryRunnable?.let { handler.removeCallbacks(it) }
        stallRecoveryRunnable = null
        stallRecoveryPending = false
    }

    /**
     * Local seek+prepare can clear brief network/glitch stalls. Permanent source
     * errors should fail through to the web remux/HLS fallback immediately.
     */
    private fun isTransientPlaybackError(error: PlaybackException): Boolean {
        return when (error.errorCode) {
            PlaybackException.ERROR_CODE_IO_NETWORK_CONNECTION_FAILED,
            PlaybackException.ERROR_CODE_IO_NETWORK_CONNECTION_TIMEOUT,
            PlaybackException.ERROR_CODE_IO_UNSPECIFIED,
            PlaybackException.ERROR_CODE_TIMEOUT,
            PlaybackException.ERROR_CODE_BEHIND_LIVE_WINDOW,
            PlaybackException.ERROR_CODE_REMOTE_ERROR,
            -> true
            else -> false
        }
    }

    private fun schedulePlaybackRecovery(
        exoPlayer: ExoPlayer,
        reason: String,
        maxAttempts: Int = MAX_STALL_RECOVERY_ATTEMPTS,
    ): Boolean {
        if (stallRecoveryPending || exoPlayer !== player) return true
        if (stallRecoveryAttempts >= maxAttempts) return false

        stallRecoveryAttempts++
        stallRecoveryPending = true
        val positionMs = exoPlayer.currentPosition
        val aheadMs = bufferAheadMs(exoPlayer)
        Log.w(
            TAG,
            "Recovering playback attempt=$stallRecoveryAttempts/$maxAttempts reason=$reason positionMs=$positionMs",
        )
        PlaybackDiag.onRecovery(reason, stallRecoveryAttempts, positionMs, aheadMs)
        val runnable = Runnable {
            stallRecoveryRunnable = null
            if (exoPlayer !== player || playbackEnded) {
                stallRecoveryPending = false
                return@Runnable
            }
            stallRecoveryPending = false
            markPlaybackProgress(positionMs)
            exoPlayer.seekTo(positionMs.coerceAtLeast(0L))
            exoPlayer.prepare()
            exoPlayer.playWhenReady = true
        }
        stallRecoveryRunnable = runnable
        handler.postDelayed(runnable, RECOVERY_DELAY_MS)
        return true
    }

    private fun reportPlaybackFailure(reason: String = "unknown") {
        if (playbackFailureReported) return
        playbackFailureReported = true
        cancelStallRecovery()
        PlaybackDiag.onFailThrough(reason, player?.let { bufferAheadMs(it) } ?: -1L)
        emitJs("window.__mediaNativePlayer?.onError?.()")
    }

    private fun bufferAheadMs(exoPlayer: ExoPlayer): Long {
        return (exoPlayer.bufferedPosition - exoPlayer.currentPosition).coerceAtLeast(0L)
    }

    private fun playbackStateName(state: Int): String {
        return when (state) {
            Player.STATE_IDLE -> "IDLE"
            Player.STATE_BUFFERING -> "BUFFERING"
            Player.STATE_READY -> "READY"
            Player.STATE_ENDED -> "ENDED"
            else -> "UNKNOWN($state)"
        }
    }

    private fun apkVersionName(): String {
        return try {
            val info = playerView.context.packageManager.getPackageInfo(playerView.context.packageName, 0)
            info.versionName ?: "unknown"
        } catch (_: Exception) {
            "unknown"
        }
    }

    /**
     * If the buffer is draining while a transfer claims to be active but no
     * bytes arrive for [TRANSFER_STALL_RECOVERY_MS], force a local seek+prepare
     * to reopen the Range (chunked loads + shorter read timeout are the primary
     * fix; this is the safety net).
     */
    private fun maybeRecoverStalledTransfer(
        exoPlayer: ExoPlayer,
        nowMs: Long,
        aheadMs: Long,
        buffering: Boolean,
    ) {
        if (playbackFailureReported || stallRecoveryPending || didAttemptSoftStallRecovery) {
            transferStallSinceMs = 0L
            return
        }
        if (lastUserSeekAtMs > 0L && nowMs - lastUserSeekAtMs < SEEK_STALL_SUPPRESS_MS) {
            transferStallSinceMs = 0L
            return
        }

        val transfers = transferListener
        val lastByteAt = transfers?.lastByteAtMs ?: 0L
        val openTransfers = transfers?.openTransferCount ?: 0
        val noByteProgress =
            lastByteAt > 0L && nowMs - lastByteAt >= TRANSFER_STALL_RECOVERY_MS
        val draining =
            (exoPlayer.isPlaying || buffering) &&
                aheadMs < TRANSFER_STALL_AHEAD_MS &&
                (openTransfers > 0 || buffering)

        if (!draining || !noByteProgress) {
            transferStallSinceMs = 0L
            return
        }

        if (transferStallSinceMs == 0L) {
            transferStallSinceMs = nowMs
            return
        }
        if (nowMs - transferStallSinceMs < TRANSFER_STALL_RECOVERY_MS) return

        transferStallSinceMs = 0L
        PlaybackDiag.onStall(
            "transfer-stall",
            nowMs - lastByteAt,
            buffering,
            playbackStateName(exoPlayer.playbackState),
            aheadMs,
        )
        schedulePlaybackRecovery(exoPlayer, "transfer-stall", maxAttempts = 1)
    }

    private fun buildBufferedRanges(exoPlayer: ExoPlayer): org.json.JSONArray {
        val ranges = org.json.JSONArray()
        val bufferedEndMs = exoPlayer.bufferedPosition
        if (bufferedEndMs <= 0L) return ranges

        ranges.put(
            org.json.JSONObject()
                .put("start", 0.0)
                .put("end", bufferedEndMs / 1000.0),
        )
        return ranges
    }

    private fun saveProgress(positionMs: Long, ended: Boolean) {
        val payload = currentPayload ?: return
        val durationMs = if (payload.durationMs > 0) {
            payload.durationMs
        } else {
            player?.duration?.takeIf { it > 0 } ?: return
        }

        watchNextManager?.update(payload, positionMs, durationMs, ended)

        ServerConnector.saveProgress(
            serverUrl = serverUrl,
            sessionToken = sessionToken,
            itemType = payload.itemType,
            itemId = payload.fileId,
            positionMs = if (ended) durationMs else positionMs,
            durationMs = durationMs,
        )
    }

    companion object {
        private const val TAG = "MediaNativePlayer"
        private const val PROGRESS_INTERVAL_MS = 500L
        /** Paint captions independently of chrome so swaps stay on the video clock. */
        private const val CUE_INTERVAL_MS = 80L
        /** While watch chrome is hidden, keep progress warm without thrashing React. */
        private const val PROGRESS_INTERVAL_HIDDEN_MS = 1500L
        private const val WATCH_NEXT_UPDATE_INTERVAL_MS = 15_000L
        /** After first READY: soft recover, then fail through — never sit for 45s. */
        private const val MID_PLAY_SOFT_RECOVERY_MS = 8_000L
        private const val MID_PLAY_STALL_TIMEOUT_MS = 16_000L
        /** Cold open (esp. 4K/HLS) may buffer before the first frame. */
        private const val INITIAL_BUFFER_GRACE_MS = 90_000L
        /** Remux/HLS restart mid-title — shorter than cold open. */
        private const val MID_PLAY_START_GRACE_MS = 35_000L
        private const val RECOVERY_DELAY_MS = 500L
        /** Match NATIVE_SEEK_STALL_SUPPRESS_MS / NATIVE_SEEK_COALESCE_MS in playback-utils.ts */
        private const val SEEK_STALL_SUPPRESS_MS = 12_000L
        private const val SEEK_COALESCE_MS = 180L
        /** Transient network errors only — buffering watchdog fails through instead. */
        private const val MAX_STALL_RECOVERY_ATTEMPTS = 1
        /** Mid-play underruns that recover: escalate after this many in the window. */
        private const val REBUFFER_ESCALATION_COUNT = 3
        private const val REBUFFER_ESCALATION_WINDOW_MS = 180_000L

        // HLS / remux — ~110s time band (TimeBandLoadControl; byte cap is allocator only).
        private const val HLS_MIN_BUFFER_MS = 108_000
        private const val HLS_MAX_BUFFER_MS = 116_000
        private const val HLS_BUFFER_FOR_PLAYBACK_MS = 5_000
        private const val HLS_BUFFER_FOR_PLAYBACK_AFTER_REBUFFER_MS = 10_000
        private const val HLS_BACK_BUFFER_MS = 60_000
        /** Allocator trim hint — must not gate loading (see TimeBandLoadControl). */
        private const val HLS_TARGET_BUFFER_BYTES = 512 * 1024 * 1024

        // Progressive — ~110s time band so slow NAS Range reopens still have runway.
        private const val PROGRESSIVE_MIN_BUFFER_MS = 108_000
        private const val PROGRESSIVE_MAX_BUFFER_MS = 116_000
        private const val PROGRESSIVE_BUFFER_FOR_PLAYBACK_MS = 2_500
        /** After seek/underrun: enough runway that play doesn't immediately re-stall. */
        private const val PROGRESSIVE_BUFFER_FOR_PLAYBACK_AFTER_REBUFFER_MS = 5_000
        private const val PROGRESSIVE_BACK_BUFFER_MS = 30_000
        /** Allocator trim hint for ~4K; loading is gated by time band only. */
        private const val PROGRESSIVE_TARGET_BUFFER_BYTES = 512 * 1024 * 1024
        /** Match server STREAM_READ_HIGH_WATER_MARK family — finite Ranges only. */
        private const val PROGRESSIVE_HTTP_CHUNK_BYTES = 4L * 1024L * 1024L
        /** Reopen when ahead is low and no HTTP bytes for this long. */
        private const val TRANSFER_STALL_RECOVERY_MS = 12_000L
        private const val TRANSFER_STALL_AHEAD_MS = 60_000L
    }
}
