package com.media.app

import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL

data class ConnectResult(
    val success: Boolean,
    val error: String? = null,
    val sessionToken: String? = null,
    val passwordRequired: Boolean = false,
)

object ServerConnector {
    fun connect(serverUrl: String, password: String?): ConnectResult {
        val authStatus = fetchAuthStatus(serverUrl)
            ?: return ConnectResult(success = false, error = "Could not reach MEDIA! at that address.")

        if (!authStatus.required) {
            return ConnectResult(success = true, passwordRequired = false)
        }

        if (password.isNullOrBlank()) {
            return ConnectResult(
                success = false,
                error = "Password required",
                passwordRequired = true,
            )
        }

        val sessionToken = login(serverUrl, password)
            ?: return ConnectResult(
                success = false,
                error = "Invalid password",
                passwordRequired = true,
            )

        return ConnectResult(
            success = true,
            sessionToken = sessionToken,
            passwordRequired = true,
        )
    }

    private data class AuthStatus(val required: Boolean, val authenticated: Boolean)

    private fun fetchAuthStatus(serverUrl: String): AuthStatus? {
        return try {
            val connection = openGet("$serverUrl/api/auth/status")
            try {
                if (connection.responseCode !in 200..299) return null
                val body = readStream(connection.inputStream)
                val json = JSONObject(body)
                AuthStatus(
                    required = json.optBoolean("required", false),
                    authenticated = json.optBoolean("authenticated", false),
                )
            } finally {
                connection.disconnect()
            }
        } catch (_: Exception) {
            null
        }
    }

    private fun login(serverUrl: String, password: String): String? {
        return try {
            val connection = openPost("$serverUrl/api/auth/login")
            try {
                OutputStreamWriter(connection.outputStream).use { writer ->
                    writer.write(JSONObject().put("password", password).toString())
                }

                if (connection.responseCode !in 200..299) return null
                parseSessionToken(connection.getHeaderField("Set-Cookie"))
            } finally {
                connection.disconnect()
            }
        } catch (_: Exception) {
            null
        }
    }

    private fun parseSessionToken(setCookie: String?): String? {
        if (setCookie.isNullOrBlank()) return null

        for (part in setCookie.split(";")) {
            val trimmed = part.trim()
            if (trimmed.startsWith("media_session=")) {
                return trimmed.removePrefix("media_session=").trim()
            }
        }

        return null
    }

    private fun openGet(url: String): HttpURLConnection {
        return (URL(url).openConnection() as HttpURLConnection).apply {
            connectTimeout = 8000
            readTimeout = 8000
            requestMethod = "GET"
            instanceFollowRedirects = true
        }
    }

    private fun openPost(url: String): HttpURLConnection {
        return (URL(url).openConnection() as HttpURLConnection).apply {
            connectTimeout = 8000
            readTimeout = 8000
            requestMethod = "POST"
            doOutput = true
            setRequestProperty("Content-Type", "application/json")
            instanceFollowRedirects = true
        }
    }

    private fun readStream(stream: java.io.InputStream): String {
        return BufferedReader(InputStreamReader(stream)).use { it.readText() }
    }

    fun logout(serverUrl: String, sessionToken: String?) {
        try {
            val connection = openPost("$serverUrl/api/auth/logout")
            if (!sessionToken.isNullOrBlank()) {
                connection.setRequestProperty("Cookie", "media_session=$sessionToken")
            }
            try {
                connection.responseCode
            } finally {
                connection.disconnect()
            }
        } catch (_: Exception) {
            // Best-effort logout; local session is cleared regardless.
        }
    }

    fun saveProgress(
        serverUrl: String,
        sessionToken: String?,
        itemType: String,
        itemId: Int,
        positionMs: Long,
        durationMs: Long,
    ) {
        try {
            val connection = openPost("$serverUrl/api/watch-progress")
            if (!sessionToken.isNullOrBlank()) {
                connection.setRequestProperty("Cookie", "media_session=$sessionToken")
            }
            try {
                val body = JSONObject()
                    .put("itemType", itemType)
                    .put("itemId", itemId)
                    .put("positionMs", positionMs)
                    .put("durationMs", durationMs)
                OutputStreamWriter(connection.outputStream).use { writer ->
                    writer.write(body.toString())
                }
                connection.responseCode
            } finally {
                connection.disconnect()
            }
        } catch (_: Exception) {
            // Best-effort progress save.
        }
    }

    fun getJson(url: String, sessionToken: String?): JSONObject? {
        return try {
            val connection = openGet(url)
            if (!sessionToken.isNullOrBlank()) {
                connection.setRequestProperty("Cookie", "media_session=$sessionToken")
            }
            try {
                if (connection.responseCode !in 200..299) return null
                JSONObject(readStream(connection.inputStream))
            } finally {
                connection.disconnect()
            }
        } catch (_: Exception) {
            null
        }
    }

    fun postJson(url: String, sessionToken: String?, body: String): Boolean {
        return try {
            val connection = openPost(url)
            if (!sessionToken.isNullOrBlank()) {
                connection.setRequestProperty("Cookie", "media_session=$sessionToken")
            }
            try {
                OutputStreamWriter(connection.outputStream).use { writer ->
                    writer.write(body)
                }
                connection.responseCode in 200..299
            } finally {
                connection.disconnect()
            }
        } catch (_: Exception) {
            false
        }
    }
}
