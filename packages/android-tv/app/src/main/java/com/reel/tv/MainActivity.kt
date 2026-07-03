package com.reel.tv

import android.annotation.SuppressLint
import android.content.Intent
import android.os.Bundle
import android.view.KeyEvent
import android.view.View
import android.view.WindowManager
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity

class MainActivity : AppCompatActivity() {
    private lateinit var webView: WebView
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
        configureWebView()
        webView.loadUrl(buildLaunchUrl(serverUrl))
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun configureWebView() {
        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            mediaPlaybackRequiresUserGesture = false
            cacheMode = WebSettings.LOAD_DEFAULT
            userAgentString = buildUserAgent(userAgentString)
        }

        webView.webChromeClient = object : WebChromeClient() {
            override fun onShowCustomView(view: View?, callback: CustomViewCallback?) {
                keepScreenOn = true
                window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                super.onShowCustomView(view, callback)
            }

            override fun onHideCustomView() {
                keepScreenOn = false
                window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                super.onHideCustomView()
            }
        }

        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(
                view: WebView?,
                request: WebResourceRequest?,
            ): Boolean {
                val target = request?.url ?: return false
                val host = target.host ?: return false
                val allowedHost = serverHost()
                return if (host.equals(allowedHost, ignoreCase = true)) {
                    false
                } else {
                    true
                }
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

    override fun onResume() {
        super.onResume()
        webView.onResume()
    }

    override fun onPause() {
        webView.onPause()
        super.onPause()
    }

    override fun onDestroy() {
        webView.destroy()
        super.onDestroy()
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        when {
            webView.canGoBack() -> webView.goBack()
            else -> openSetup(resetServer = false)
        }
    }

    override fun onKeyDown(keyCode: Int, event: KeyEvent?): Boolean {
        if (keyCode == KeyEvent.KEYCODE_BACK) {
            onBackPressed()
            return true
        }
        if (keyCode == KeyEvent.KEYCODE_MENU) {
            openSetup(resetServer = true)
            return true
        }
        return super.onKeyDown(keyCode, event)
    }

    private fun openSetup(resetServer: Boolean) {
        if (resetServer) {
            ServerPreferences.clearServerUrl(this)
        }
        startActivity(Intent(this, SetupActivity::class.java))
        finish()
    }

    companion object {
        const val EXTRA_SERVER_URL = "server_url"
        private const val USER_AGENT_TOKEN = "ReelAndroidTV"
    }
}
