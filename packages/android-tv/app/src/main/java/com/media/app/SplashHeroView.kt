package com.media.app

import android.animation.AnimatorSet
import android.animation.ObjectAnimator
import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.Shader
import android.util.AttributeSet
import android.view.View
import android.view.animation.AccelerateDecelerateInterpolator
import android.view.animation.LinearInterpolator
import android.widget.FrameLayout
import android.widget.TextView
import androidx.appcompat.widget.AppCompatTextView
import androidx.core.content.ContextCompat

/** Homepage-style startup hero: watermark, signal rings, gradient MEDIA + animated ! */
class SplashHeroView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
) : FrameLayout(context, attrs) {
    private var bangAnimator: AnimatorSet? = null
    private val ringAnimators = mutableListOf<AnimatorSet>()

    init {
        clipChildren = false
        clipToPadding = false
        inflate(context, R.layout.splash_hero_content, this)
    }

    override fun onFinishInflate() {
        super.onFinishInflate()
        findViewById<OutlineTextView>(R.id.splashWatermark)?.apply {
            setStrokeColor(ContextCompat.getColor(context, R.color.media_hero_primary_14))
            alpha = 0.55f
        }
        findViewById<TextView>(R.id.splashTitleBang)?.setShadowLayer(
            dp(24f),
            0f,
            0f,
            Color.parseColor("#8CD9FF5C"),
        )
    }

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        startAnimations()
    }

    override fun onDetachedFromWindow() {
        stopAnimations()
        super.onDetachedFromWindow()
    }

    private fun startAnimations() {
        stopAnimations()

        val bang = findViewById<TextView>(R.id.splashTitleBang)
        val media = findViewById<GradientShiftTextView>(R.id.splashTitleMedia)
        val ring1 = findViewById<View>(R.id.splashRing1)
        val ring2 = findViewById<View>(R.id.splashRing2)
        val ring3 = findViewById<View>(R.id.splashRing3)

        media.startGradientAnimation()

        val translateY =
            ObjectAnimator.ofFloat(bang, TRANSLATION_Y, 0f, -dp(6f), 0f).apply {
                duration = 4000L
                repeatCount = ObjectAnimator.INFINITE
                repeatMode = ObjectAnimator.REVERSE
                interpolator = AccelerateDecelerateInterpolator()
            }
        val rotate =
            ObjectAnimator.ofFloat(bang, ROTATION, 0f, -6f, 0f).apply {
                duration = 4000L
                repeatCount = ObjectAnimator.INFINITE
                repeatMode = ObjectAnimator.REVERSE
                interpolator = AccelerateDecelerateInterpolator()
            }
        bangAnimator =
            AnimatorSet().apply {
                playTogether(translateY, rotate)
                start()
            }

        startRingPulse(ring1, 0L)
        startRingPulse(ring2, 1800L)
        startRingPulse(ring3, 3600L)
    }

    private fun startRingPulse(view: View, startDelay: Long) {
        val scaleX = ObjectAnimator.ofFloat(view, SCALE_X, 0.55f, 1.35f).apply {
            repeatCount = ObjectAnimator.INFINITE
        }
        val scaleY = ObjectAnimator.ofFloat(view, SCALE_Y, 0.55f, 1.35f).apply {
            repeatCount = ObjectAnimator.INFINITE
        }
        val alpha = ObjectAnimator.ofFloat(view, ALPHA, 0.65f, 0f).apply {
            repeatCount = ObjectAnimator.INFINITE
        }
        val animator = AnimatorSet().apply {
            playTogether(scaleX, scaleY, alpha)
            duration = 5500L
            this.startDelay = startDelay
            interpolator = LinearInterpolator()
        }
        animator.start()
        ringAnimators += animator
    }

    private fun stopAnimations() {
        bangAnimator?.cancel()
        bangAnimator = null
        ringAnimators.forEach { it.cancel() }
        ringAnimators.clear()
        findViewById<GradientShiftTextView>(R.id.splashTitleMedia)?.stopGradientAnimation()
    }

    private fun dp(value: Float): Float = value * resources.displayMetrics.density
}

/** Stroked outline text used for the hero ghost + watermark layers. */
class OutlineTextView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
) : AppCompatTextView(context, attrs) {
    private var strokeColor: Int =
        ContextCompat.getColor(context, R.color.media_hero_primary_22)
    private var strokeWidthPx: Float = resources.displayMetrics.density * 1.25f

    init {
        setTextColor(Color.TRANSPARENT)
        setShadowLayer(0f, 0f, 0f, Color.TRANSPARENT)
    }

    fun setStrokeColor(color: Int) {
        strokeColor = color
        invalidate()
    }

    override fun onDraw(canvas: Canvas) {
        val textPaint = paint
        textPaint.style = Paint.Style.STROKE
        textPaint.strokeWidth = strokeWidthPx
        textPaint.color = strokeColor
        super.onDraw(canvas)
    }
}

/** Animated primary → accent gradient fill matching the homepage hero title. */
class GradientShiftTextView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
) : AppCompatTextView(context, attrs) {
    private var gradient: LinearGradient? = null

    override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
        super.onSizeChanged(w, h, oldw, oldh)
        if (w <= 0) return
        val start = ContextCompat.getColor(context, R.color.media_hero_primary)
        val end = ContextCompat.getColor(context, R.color.media_hero_accent)
        gradient =
            LinearGradient(
                0f,
                0f,
                w.toFloat() * 2f,
                h.toFloat(),
                intArrayOf(start, start, end),
                floatArrayOf(0f, 0.42f, 1f),
                Shader.TileMode.CLAMP,
            )
        paint.shader = gradient
    }

    fun startGradientAnimation() {
        // Keep the first frame cheap on Android TV. Animating a text shader
        // requires a full text invalidate every frame; the rings and bang
        // provide motion without forcing the title through the UI thread.
    }

    fun stopGradientAnimation() {
        // Gradient is intentionally static; no per-frame shader invalidation.
    }

    override fun onDetachedFromWindow() {
        stopGradientAnimation()
        super.onDetachedFromWindow()
    }
}
