package com.shengproxy.tts

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.AccessibilityService.ScreenshotResult
import android.graphics.Bitmap
import android.graphics.Rect
import android.os.Build
import android.util.Log
import android.view.Display
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityManager
import android.view.accessibility.AccessibilityNodeInfo
import android.speech.tts.TextToSpeech
import androidx.annotation.RequiresApi
import androidx.core.content.ContextCompat
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.TextRecognizer
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import java.util.Locale
import java.util.concurrent.Executor
import java.util.concurrent.atomic.AtomicLong
import java.io.ByteArrayOutputStream
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

class UnlabeledImageService : AccessibilityService() {
    private val screenshotExecutor: Executor by lazy { ContextCompat.getMainExecutor(this) }
    private val accessibilityManager by lazy {
        getSystemService(AccessibilityManager::class.java)
    }
    private val requestIds = AtomicLong()
    private val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private var onlineOcrJob: kotlinx.coroutines.Job? = null
    private var activeFocusKey: String? = null
    private var lastRequestedKey: String? = null
    private var lastRequestedAt = 0L
    private var textRecognizer: TextRecognizer? = null
    private var speech: TextToSpeech? = null
    private var speechReady = false

    override fun onServiceConnected() {
        super.onServiceConnected()
        textRecognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
        Log.i(TAG, "Accessibility OCR service connected")
        speech = TextToSpeech(this) { result ->
            speechReady = result == TextToSpeech.SUCCESS
            Log.i(TAG, "System TTS ready=$speechReady")
        }
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        if (event?.eventType != AccessibilityEvent.TYPE_VIEW_ACCESSIBILITY_FOCUSED &&
            event?.eventType != AccessibilityEvent.TYPE_VIEW_CLICKED
        ) return

        val node = event.source ?: run {
            activeFocusKey = null
            return
        }
        val bounds = Rect().also(node::getBoundsInScreen)
        val key = "${event.windowId}:${node.className}:$bounds"
        activeFocusKey = key

        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R ||
            !accessibilityManager.isTouchExplorationEnabled ||
            !isImageNode(node) ||
            bounds.isEmpty
        ) return
        Log.i(
            TAG,
            "Image accessibility event=${event.eventType}; class=${node.className}; bounds=${bounds.width()}x${bounds.height()}"
        )

        val now = System.currentTimeMillis()
        if (key == lastRequestedKey && now - lastRequestedAt < REQUEST_COOLDOWN_MS) return
        lastRequestedKey = key
        lastRequestedAt = now
        captureFocusedImage(bounds, key, requestIds.incrementAndGet())
    }

    private fun isImageNode(node: AccessibilityNodeInfo): Boolean {
        val className = node.className?.toString()?.lowercase(Locale.ROOT) ?: return false
        val viewId = node.viewIdResourceName?.lowercase(Locale.ROOT).orEmpty()
        return className.contains("image") ||
            className.contains("photo") ||
            viewId.contains("image") ||
            viewId.contains("photo")
    }

    @RequiresApi(Build.VERSION_CODES.R)
    private fun captureFocusedImage(bounds: Rect, focusKey: String, requestId: Long) {
        takeScreenshot(Display.DEFAULT_DISPLAY, screenshotExecutor, object : TakeScreenshotCallback {
            override fun onSuccess(screenshot: ScreenshotResult) {
                val buffer = screenshot.hardwareBuffer
                val fullBitmap = try {
                    Bitmap.wrapHardwareBuffer(buffer, screenshot.colorSpace)
                        ?.copy(Bitmap.Config.ARGB_8888, false)
                } finally {
                    buffer.close()
                }
                if (fullBitmap == null) {
                    Log.w(TAG, "Could not read screenshot buffer")
                    return
                }

                val crop = cropToBounds(fullBitmap, bounds)
                fullBitmap.recycle()
                if (crop == null) {
                    Log.i(TAG, "Focused image bounds were outside the screenshot")
                    return
                }
                Log.i(TAG, "Image crop ready; dimensions=${crop.width}x${crop.height}")
                recognizeText(crop, focusKey, requestId)
            }

            override fun onFailure(errorCode: Int) {
                Log.w(TAG, "Screenshot unavailable for focused image (code=$errorCode)")
            }
        })
    }

    private fun cropToBounds(screen: Bitmap, bounds: Rect): Bitmap? {
        val left = bounds.left.coerceIn(0, screen.width)
        val top = bounds.top.coerceIn(0, screen.height)
        val right = bounds.right.coerceIn(0, screen.width)
        val bottom = bounds.bottom.coerceIn(0, screen.height)
        if (right <= left || bottom <= top) return null

        val crop = Bitmap.createBitmap(screen, left, top, right - left, bottom - top)
        val longestSide = maxOf(crop.width, crop.height)
        if (longestSide <= MAX_IMAGE_DIMENSION) return crop

        val scale = MAX_IMAGE_DIMENSION.toFloat() / longestSide
        val resized = Bitmap.createScaledBitmap(
            crop,
            (crop.width * scale).toInt().coerceAtLeast(1),
            (crop.height * scale).toInt().coerceAtLeast(1),
            true
        )
        crop.recycle()
        return resized
    }

    private fun recognizeText(image: Bitmap, focusKey: String, requestId: Long) {
        val onlineClient = if (OnlineOcrSettings.isEnabled(this)) {
            FirebasePronunciationClient.createIfConfigured(this)
        } else {
            null
        }
        if (onlineClient != null) {
            val jpeg = ByteArrayOutputStream().use { output ->
                if (image.compress(Bitmap.CompressFormat.JPEG, 85, output)) {
                    output.toByteArray()
                } else {
                    null
                }
            }
            if (jpeg != null && jpeg.size <= MAX_ONLINE_IMAGE_BYTES) {
                Log.i(TAG, "Sending focused image to online OCR; bytes=${jpeg.size}")
                onlineOcrJob = serviceScope.launch {
                    try {
                        val text = onlineClient.recognizeImage(jpeg)
                        if (!isCurrentRequest(focusKey, requestId)) {
                            image.recycle()
                            return@launch
                        }
                        if (text.isNotEmpty()) {
                            announceText(text, requestId)
                            image.recycle()
                        } else {
                            Log.i(TAG, "Online OCR found no text; using on-device OCR")
                            recognizeOnDevice(image, focusKey, requestId)
                        }
                    } catch (error: CancellationException) {
                        image.recycle()
                        throw error
                    } catch (error: Exception) {
                        Log.w(TAG, "Online OCR unavailable; using on-device OCR", error)
                        if (isCurrentRequest(focusKey, requestId)) {
                            recognizeOnDevice(image, focusKey, requestId)
                        } else {
                            image.recycle()
                        }
                    }
                }
                return
            }
            Log.w(TAG, "Focused image exceeds online OCR size limit; using on-device OCR")
        } else if (OnlineOcrSettings.isEnabled(this)) {
            Log.w(TAG, "Online OCR is enabled but Firebase is not configured; using on-device OCR")
        }
        recognizeOnDevice(image, focusKey, requestId)
    }

    private fun recognizeOnDevice(image: Bitmap, focusKey: String, requestId: Long) {
        val input = InputImage.fromBitmap(image, 0)
        val recognizer = textRecognizer
        if (recognizer == null) {
            image.recycle()
            Log.w(TAG, "On-device text recognizer is unavailable")
            return
        }

        Log.i(TAG, "Starting on-device OCR")
        recognizer.process(input)
            .addOnSuccessListener(screenshotExecutor) { result ->
                if (!isCurrentRequest(focusKey, requestId)) return@addOnSuccessListener

                val recognizedText = result.text.trim()
                Log.i(TAG, "OCR completed; recognizedCharacters=${recognizedText.length}")
                if (recognizedText.isNotEmpty()) {
                    announceText(recognizedText, requestId)
                }
            }
            .addOnFailureListener(screenshotExecutor) { error ->
                Log.w(TAG, "On-device image OCR failed", error)
            }
            .addOnCompleteListener(screenshotExecutor) {
                image.recycle()
            }
    }

    private fun isCurrentRequest(focusKey: String, requestId: Long): Boolean =
        activeFocusKey == focusKey &&
            accessibilityManager.isTouchExplorationEnabled &&
            requestIds.get() == requestId

    private fun announceText(text: String, requestId: Long) {
        if (!speechReady) {
            Log.w(TAG, "OCR found text, but system TTS is not ready")
            return
        }
        val speechStatus = speech?.speak(
            "Text in image: $text",
            TextToSpeech.QUEUE_ADD,
            null,
            "image-ocr-$requestId"
        )
        Log.i(TAG, "OCR announcement queued; ttsStatus=$speechStatus")
    }

    override fun onInterrupt() = Unit

    override fun onDestroy() {
        onlineOcrJob?.cancel()
        serviceScope.cancel()
        textRecognizer?.close()
        speech?.stop()
        speech?.shutdown()
        super.onDestroy()
    }

    private companion object {
        const val TAG = "UnlabeledImageService"
        const val MAX_IMAGE_DIMENSION = 2048
        const val MAX_ONLINE_IMAGE_BYTES = 1_500_000
        const val REQUEST_COOLDOWN_MS = 5000L
    }
}
