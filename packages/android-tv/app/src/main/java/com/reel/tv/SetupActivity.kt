package com.reel.tv

import android.content.Intent
import android.os.Bundle
import android.view.KeyEvent
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors

class SetupActivity : AppCompatActivity() {
    private val executor = Executors.newSingleThreadExecutor()
    private lateinit var hostInput: EditText
    private lateinit var portInput: EditText
    private lateinit var statusText: TextView
    private lateinit var connectButton: Button

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        ServerPreferences.getServerUrl(this)?.let { savedUrl ->
            startMainActivity(savedUrl)
            return
        }

        setContentView(R.layout.activity_setup)

        hostInput = findViewById(R.id.hostInput)
        portInput = findViewById(R.id.portInput)
        statusText = findViewById(R.id.statusText)
        connectButton = findViewById(R.id.connectButton)

        connectButton.setOnClickListener { attemptConnect() }
        hostInput.setOnEditorActionListener { _, _, _ ->
            attemptConnect()
            true
        }
        portInput.setOnEditorActionListener { _, _, _ ->
            attemptConnect()
            true
        }

        hostInput.requestFocus()
    }

    override fun onDestroy() {
        executor.shutdownNow()
        super.onDestroy()
    }

    private fun attemptConnect() {
        val serverUrl = ServerPreferences.normalizeServerUrl(
            hostInput.text.toString(),
            portInput.text.toString(),
        )

        if (serverUrl == null) {
            statusText.setText(R.string.invalid_host)
            return
        }

        setConnecting(true)
        statusText.text = getString(R.string.connecting)

        executor.execute {
            val error = validateServer(serverUrl)
            runOnUiThread {
                setConnecting(false)
                if (error == null) {
                    ServerPreferences.saveServerUrl(this, serverUrl)
                    statusText.setTextColor(ContextCompat.getColor(this, R.color.reel_primary))
                    statusText.setText(R.string.connected)
                    startMainActivity(serverUrl)
                } else {
                    statusText.setTextColor(ContextCompat.getColor(this, R.color.reel_error))
                    statusText.text = getString(R.string.connection_failed)
                }
            }
        }
    }

    private fun validateServer(serverUrl: String): String? {
        return try {
            val url = URL("$serverUrl/api/status")
            val connection = (url.openConnection() as HttpURLConnection).apply {
                connectTimeout = 8000
                readTimeout = 8000
                requestMethod = "GET"
                instanceFollowRedirects = true
            }

            try {
                val code = connection.responseCode
                if (code in 200..299) null else "HTTP $code"
            } finally {
                connection.disconnect()
            }
        } catch (e: Exception) {
            e.message ?: "error"
        }
    }

    private fun setConnecting(connecting: Boolean) {
        connectButton.isEnabled = !connecting
        hostInput.isEnabled = !connecting
        portInput.isEnabled = !connecting
        connectButton.text = if (connecting) {
            getString(R.string.connecting)
        } else {
            getString(R.string.connect)
        }
    }

    private fun startMainActivity(serverUrl: String) {
        val intent = Intent(this, MainActivity::class.java).apply {
            putExtra(MainActivity.EXTRA_SERVER_URL, serverUrl)
        }
        startActivity(intent)
        finish()
    }

    override fun onKeyDown(keyCode: Int, event: KeyEvent?): Boolean {
        if (keyCode == KeyEvent.KEYCODE_BACK) {
            finishAffinity()
            return true
        }
        return super.onKeyDown(keyCode, event)
    }
}
