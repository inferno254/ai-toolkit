package com.shengproxy.tts

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import android.provider.Settings
import android.view.Gravity
import android.view.ViewGroup
import android.widget.CheckBox
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import android.accessibilityservice.AccessibilityServiceInfo
import android.view.accessibility.AccessibilityManager

class ImageAssistActivity : Activity() {
    private lateinit var status: TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val content = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(32, 32, 32, 32)
        }

        content.addView(TextView(this).apply {
            text = "Sheng Image OCR"
            textSize = 24f
            contentDescription = text
        })
        content.addView(TextView(this).apply {
            text = "Reads visible text in an unlabeled image when touch exploration focuses it. Android does not let this app replace TalkBack’s own image handling."
            textSize = 16f
            setPadding(0, 20, 0, 20)
        })

        status = TextView(this).apply {
            textSize = 18f
            contentDescription = text
        }
        content.addView(status)

        content.addView(CheckBox(this).apply {
            text = "Online pronunciation help (sends unknown words and up to 280 characters of nearby text to the configured backend)"
            minHeight = 56
            isChecked = OnlineAssistSettings.isEnabled(this@ImageAssistActivity)
            setOnCheckedChangeListener { _, checked ->
                OnlineAssistSettings.setEnabled(this@ImageAssistActivity, checked)
                updateStatus()
            }
        })

        content.addView(TextView(this).apply {
            text = "Online pronunciation is off by default. Only unknown words and short context are sent; known lexicon words are redacted."
            textSize = 14f
            setPadding(0, 8, 0, 16)
        })

        content.addView(CheckBox(this).apply {
            text = "Online OCR (uploads a JPEG crop of the focused image to the configured backend)"
            minHeight = 56
            isChecked = OnlineOcrSettings.isEnabled(this@ImageAssistActivity)
            setOnCheckedChangeListener { _, checked ->
                OnlineOcrSettings.setEnabled(this@ImageAssistActivity, checked)
                updateStatus()
            }
        })

        content.addView(TextView(this).apply {
            text = "Online OCR is off by default. When enabled, the focused image is sent for transcription. If the service is unavailable, the app falls back to on-device OCR."
            textSize = 14f
            setPadding(0, 8, 0, 16)
        })

        content.addView(Button(this).apply {
            text = "Open accessibility settings"
            minHeight = 48
            setOnClickListener {
                startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS))
            }
        }, LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.WRAP_CONTENT
        ).apply {
            topMargin = 20
        })

        content.addView(TextView(this).apply {
            text = "Privacy: with online OCR off, images are processed on-device and are not uploaded. With online OCR enabled, only the focused image crop is uploaded for transcription. Online pronunciation is separately opt-in and sends only unknown words plus short context."
            textSize = 14f
            setPadding(0, 24, 0, 0)
        })
        setContentView(content)
        updateStatus()
    }

    override fun onResume() {
        super.onResume()
        if (::status.isInitialized) updateStatus()
    }

    private fun updateStatus() {
        val enabled = getSystemService(AccessibilityManager::class.java)
            .getEnabledAccessibilityServiceList(AccessibilityServiceInfo.FEEDBACK_ALL_MASK)
            .any { it.resolveInfo.serviceInfo.packageName == packageName &&
                it.resolveInfo.serviceInfo.name == UnlabeledImageService::class.java.name }
        val serviceStatus = if (enabled) {
            "Image OCR is enabled."
        } else {
            "Image OCR is off. Enable Sheng OCR for images in Accessibility settings."
        }
        val backendStatus = if (FirebasePronunciationClient.createIfConfigured(this) != null) {
            "Firebase is configured for online pronunciation and OCR."
        } else {
            "Firebase app configuration is missing; both online features will use offline fallback."
        }
        status.text = "$serviceStatus\n$backendStatus"
    }
}
