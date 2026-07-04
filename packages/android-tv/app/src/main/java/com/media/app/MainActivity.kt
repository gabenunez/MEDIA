package com.media.app

import android.annotation.SuppressLint
import android.content.Intent
import android.graphics.Color
import android.os.Build
import android.os.Bundle
import android.view.KeyEvent
import android.view.View
import android.view.WindowManager
import android.webkit.CookieManager
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.media3.ui.PlayerView
import java.util.concurrent.Executors

class MainActivity : AppCompatActivity() {
    private val executor = Executors.newSingleThreadExecutor()
    private lateinit var webView: WebView
    private lateinit var nativePlayerView: PlayerView
    private lateinit var nativePlayer: NativePlayerManager
    private var serverUrl: String = ""
    private var keepScreenOn = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        serverUrl = intent.getStringExtra(EXTRA_SERVER_URL)
            ?: ServerPreferences.getServerUrl(this)
            ?: run {
                startActivity(Intent(this, SetupActivity::class.java))
                finish()
                return
            }

        webView = findViewById(R.id.webView)
        nativePlayerView = findViewById(R.id.nativePlayerView)
        nativePlayer = NativePlayerManager(nativePlayerView) { script ->
            webView.post { webView.evaluateJavascript(script, null) }
        }

        configureWebView()
        configureBackNavigation()
        applySessionCookie()
        webView.loadUrl(buildLaunchUrl(serverUrl))
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun configureWebView() {
        webView.setBackgroundColor(Color.BLACK)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.HONEYCOMB) {
            webView.setLayerType(View.LAYER_TYPE_HARDWARE, null)
        }

        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            mediaPlaybackRequiresUserGesture = false
            cacheMode = WebSettings.LOAD_DEFAULT
            userAgentString = buildUserAgent(userAgentString)
        }

        val bridge = MediaAndroidBridge()
        webView.addJavascriptInterface(bridge, "MediaAndroid")
        webView.addJavascriptInterface(bridge, "ReelAndroid")

        webView.webChromeClient = object : WebChromeClient() {
            override fun onShowCustomView(view: View?, callback: CustomViewCallback?) {
                keepScreenOn = true
                window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                super.onShowCustomView(view, callback)
            }

            override fun onHideCustomView() {
                keepScreenOn = false
                updateKeepScreenOn()
                super.onHideCustomView()
            }
        }

        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(
                view: WebView?,
                request: WebResourceRequest?,
            ): Boolean {
                val target = request?.url ?: return false
                if (!request.isForMainFrame) return false

                val scheme = target.scheme?.lowercase()
                if (scheme != "http" && scheme != "https") {
                    return true
                }

                val host = target.host ?: return true
                val allowedHost = serverHost()
                return !host.equals(allowedHost, ignoreCase = true)
            }

            override fun onReceivedError(
                view: WebView?,
                request: WebResourceRequest?,
                error: WebResourceError?,
            ) {
                if (request?.isForMainFrame == true) {
                    Toast.makeText(
                        this@MainActivity,
                        getString(R.string.connection_failed),
                        Toast.LENGTH_LONG,
                    ).show()
                }
            }
        }
    }

    private fun configureBackNavigation() {
        onBackPressedDispatcher.addCallback(
            this,
            object : OnBackPressedCallback(true) {
                override fun handleOnBackPressed() {
                    when {
                        nativePlayer.isActive() -> {
                            nativePlayer.stop()
                            updateKeepScreenOn()
                        }
                        webView.canGoBack() -> webView.goBack()
                        else -> finishAffinity()
                    }
                }
            },
        )
    }

    private fun applySessionCookie() {
        CookieManager.getInstance().setAcceptCookie(true)
        val token = AuthSession.resolveSessionToken(this, serverUrl) ?: return
        val cookieManager = CookieManager.getInstance()
        cookieManager.setCookie(serverUrl, "media_session=$token")
        cookieManager.setCookie(serverUrl, "reel_session=$token")
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            cookieManager.flush()
        }
    }

    private fun clearSessionCookie() {
        val cookieManager = CookieManager.getInstance()
        cookieManager.setAcceptCookie(true)
        cookieManager.setCookie(serverUrl, "media_session=; Max-Age=0")
        cookieManager.setCookie(serverUrl, "reel_session=; Max-Age=0")
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            cookieManager.flush()
        }
    }

    fun performLogout(reload: Boolean = true) {
        pauseAllPlayback()
        val sessionToken = SessionPreferences.getSessionToken(this)
        executor.execute {
            ServerConnector.logout(serverUrl, sessionToken)
            runOnUiThread {
                SessionPreferences.clearSessionToken(this)
                clearSessionCookie()
                if (reload) {
                    webView.loadUrl(buildLaunchUrl(serverUrl))
                }
            }
        }
    }

    private fun showAccountMenu() {
        AlertDialog.Builder(this)
            .setTitle(R.string.account_menu_title)
            .setItems(
                arrayOf(
                    getString(R.string.log_out),
                    getString(R.string.change_server),
                ),
            ) { _, which ->
                when (which) {
                    0 -> performLogout()
                    1 -> openSetup(resetServer = true)
                }
            }
            .setNegativeButton(android.R.string.cancel, null)
            .show()
    }

    private fun buildLaunchUrl(baseUrl: String): String {
        val trimmed = baseUrl.trimEnd('/')
        return "$trimmed/?tv=1"
    }

    private fun buildUserAgent(defaultAgent: String): String {
        return if (defaultAgent.contains(USER_AGENT_TOKEN)) {
            defaultAgent
        } else {
            "$defaultAgent $USER_AGENT_TOKEN/1.0"
        }
    }

    private fun serverHost(): String {
        return try {
            java.net.URI(serverUrl).host ?: ""
        } catch (_: Exception) {
            ""
        }
    }

    private fun pauseAllPlayback() {
        if (nativePlayer.isActive()) {
            nativePlayer.pause()
        }
        pauseWebPlayback()
        updateKeepScreenOn()
    }

    private fun pauseWebPlayback() {
        webView.evaluateJavascript(PAUSE_WEB_PLAYBACK_JS, null)
    }

    private fun dispatchMediaKeyToWeb(keyCode: Int) {
        val key =
            when (keyCode) {
                KeyEvent.KEYCODE_MEDIA_PLAY -> "MediaPlay"
                KeyEvent.KEYCODE_MEDIA_PAUSE -> "MediaPause"
                else -> "MediaPlayPause"
            }
        webView.evaluateJavascript(
            """
            (function(){
              window.dispatchEvent(new KeyboardEvent('keydown', { key: '$key', bubbles: true }));
            })();
            """.trimIndent(),
            null,
        )
    }

    private fun updateKeepScreenOn() {
        val shouldKeepOn = keepScreenOn || nativePlayer.isPlaying()
        if (shouldKeepOn) {
            window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        } else {
            window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        }
    }

    override fun onResume() {
        super.onResume()
        webView.onResume()
    }

    override fun onPause() {
        pauseAllPlayback()
        webView.onPause()
        super.onPause()
    }

    override fun onDestroy() {
        executor.shutdownNow()
        nativePlayer.release()
        webView.destroy()
        super.onDestroy()
    }

    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        if (event.action == KeyEvent.ACTION_DOWN) {
            when (event.keyCode) {
                KeyEvent.KEYCODE_MEDIA_PLAY,
                KeyEvent.KEYCODE_MEDIA_PAUSE,
                KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE -> {
                    if (nativePlayer.isActive()) {
                        nativePlayer.togglePlayPause()
                        updateKeepScreenOn()
                        return true
                    }
                    dispatchMediaKeyToWeb(event.keyCode)
                    return true
                }
                KeyEvent.KEYCODE_DPAD_CENTER,
                KeyEvent.KEYCODE_ENTER,
                KeyEvent.KEYCODE_NUMPAD_ENTER -> {
                    if (nativePlayer.isActive()) {
                        nativePlayer.togglePlayPause()
                        return true
                    }
                }
                KeyEvent.KEYCODE_DPAD_LEFT,
                KeyEvent.KEYCODE_MEDIA_REWIND -> {
                    if (nativePlayer.isActive()) {
                        val position = nativePlayer.currentPositionMs()
                        nativePlayer.seekTo((position - 10_000).coerceAtLeast(0L))
                        return true
                    }
                }
                KeyEvent.KEYCODE_DPAD_RIGHT,
                KeyEvent.KEYCODE_MEDIA_FAST_FORWARD -> {
                    if (nativePlayer.isActive()) {
                        val position = nativePlayer.currentPositionMs()
                        nativePlayer.seekTo(position + 10_000)
                        return true
                    }
                }
            }
        }

        return super.dispatchKeyEvent(event)
    }

    override fun onKeyDown(keyCode: Int, event: KeyEvent?): Boolean {
        if (keyCode == KeyEvent.KEYCODE_MENU) {
            showAccountMenu()
            return true
        }
        return super.onKeyDown(keyCode, event)
    }

    private fun openSetup(resetServer: Boolean) {
        nativePlayer.stop()
        if (resetServer) {
            ServerPreferences.clearServerUrl(this)
        }
        startActivity(Intent(this, SetupActivity::class.java))
        finish()
    }

    private inner class MediaAndroidBridge {
        @JavascriptInterface
        fun logout() {
            runOnUiThread {
                performLogout(reload = true)
            }
        }

        @JavascriptInterface
        fun play(payload: String) {
            runOnUiThread {
                val sessionToken = AuthSession.resolveSessionToken(this@MainActivity, serverUrl)
                if (sessionToken.isNullOrBlank()) {
                    Toast.makeText(
                        this@MainActivity,
                        R.string.playback_auth_required,
                        Toast.LENGTH_LONG,
                    ).show()
                    webView.evaluateJavascript("window.__mediaNativePlayer?.onError?.()", null)
                    return@runOnUiThread
                }

                val parsed = PlaybackPayload.parse(payload)
                if (parsed == null) {
                    webView.evaluateJavascript("window.__mediaNativePlayer?.onError?.()", null)
                    return@runOnUiThread
                }

                window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                nativePlayer.play(serverUrl, sessionToken, parsed)
            }
        }

        @JavascriptInterface
        fun pause() {
            runOnUiThread { nativePlayer.pause() }
        }

        @JavascriptInterface
        fun resume() {
            runOnUiThread { nativePlayer.resume() }
        }

        @JavascriptInterface
        fun seekTo(positionMs: Double) {
            runOnUiThread { nativePlayer.seekTo(positionMs.toLong()) }
        }

        @JavascriptInterface
        fun stop() {
            runOnUiThread {
                nativePlayer.stop()
                updateKeepScreenOn()
            }
        }
    }

    companion object {
        const val EXTRA_SERVER_URL = "server_url"
        private const val USER_AGENT_TOKEN = "MediaAndroidTV"
        private const val PAUSE_WEB_PLAYBACK_JS =
            "(function(){var video=document.querySelector('video');if(video&&!video.paused){video.pause();}})();"
    }
}
