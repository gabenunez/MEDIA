package com.media.app

import android.util.Log
import org.json.JSONObject
import java.util.concurrent.Executors

class TvCastPoller(
    private val serverUrl: String,
    private val sessionTokenProvider: () -> String?,
    private val onCast: (JSONObject) -> Unit,
) {
    private val executor = Executors.newSingleThreadExecutor()
    private var running = false

    fun start() {
        if (running) return
        running = true
        executor.execute { pollLoop() }
    }

    fun stop() {
        running = false
    }

    fun shutdown() {
        running = false
        executor.shutdownNow()
    }

    private fun pollLoop() {
        while (running) {
            try {
                sendHeartbeat()
                pollPendingCast()
            } catch (err: Exception) {
                Log.w(TAG, "TV cast poll failed", err)
            }

            try {
                Thread.sleep(POLL_INTERVAL_MS)
            } catch (_: InterruptedException) {
                return
            }
        }
    }

    private fun sendHeartbeat() {
        val token = sessionTokenProvider() ?: return
        ServerConnector.postJson(
            "$serverUrl/api/cast/tv/heartbeat",
            token,
            """{"label":"MEDIA! TV"}""",
        )
    }

    private fun pollPendingCast() {
        val token = sessionTokenProvider() ?: return
        val response =
            ServerConnector.getJson("$serverUrl/api/cast/tv/pending", token) ?: return
        val pending = response.optJSONObject("pending") ?: return
        onCast(pending)
    }

    companion object {
        private const val TAG = "TvCastPoller"
        private const val POLL_INTERVAL_MS = 4_000L
    }
}
