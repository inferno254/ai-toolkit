package com.shengproxy.tts

import android.media.AudioFormat
import android.speech.tts.SynthesisCallback
import android.speech.tts.SynthesisRequest
import android.speech.tts.TextToSpeech
import android.speech.tts.TextToSpeechService
import android.speech.tts.UtteranceProgressListener
import android.util.Log
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import java.io.File
import java.io.RandomAccessFile
import java.util.concurrent.TimeUnit

class ShengProxyTtsService : TextToSpeechService() {

    private val tag = "ShengProxyTtsService"
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val operationLock = Any()
    private val ttsReady = CompletableDeferred<Boolean>()
    private val operations = mutableSetOf<SynthesisOperation>()

    private var internalTts: TextToSpeech? = null
    private var pipeline: ShengPipeline? = null
    private var activeOperation: SynthesisOperation? = null

    private class SynthesisOperation(val callback: SynthesisCallback) {
        var synthesisResult: CompletableDeferred<Boolean>? = null
        var job: Job? = null
        val files = mutableListOf<File>()
        var currentFile: File? = null
        var currentUtteranceId: String? = null
        var cancelled = false
        var synthesisStarted = false
        var synthesisTerminal = true
        var consumerFinished = false
        var callbackFinished = false
        var callbackStarted = false
        var sampleRate = 0
        var channels = 0
    }

    override fun onCreate() {
        super.onCreate()
        try {
            LexiconManager.initialize(this)
            val pronouncer = GcpPronunciationClient()
            pipeline = ShengPipeline(pronouncer)

            internalTts = TextToSpeech(this, { status ->
                val ready = status == TextToSpeech.SUCCESS
                if (ready) {
                    Log.d(tag, "Internal TTS initialized")
                } else {
                    Log.e(tag, "Internal TTS initialization failed: $status")
                }
                ttsReady.complete(ready)
            }, "com.google.android.tts")
        } catch (e: Exception) {
            ttsReady.complete(false)
            Log.e(tag, "Service creation failed", e)
        }
    }

    override fun onIsLanguageAvailable(lang: String?, country: String?, variant: String?): Int =
        TextToSpeech.LANG_AVAILABLE

    override fun onLoadLanguage(lang: String?, country: String?, variant: String?): Int =
        TextToSpeech.LANG_AVAILABLE

    override fun onGetLanguage(): Array<String> = arrayOf("eng", "US", "")

    override fun onSynthesizeText(request: SynthesisRequest, callback: SynthesisCallback) {
        val text = request.charSequenceText?.toString().orEmpty()
        if (text.isBlank()) {
            callback.start(22050, AudioFormat.ENCODING_PCM_16BIT, 1)
            callback.done()
            return
        }

        val operation = SynthesisOperation(callback)
        val job = scope.launch(Dispatchers.IO, start = kotlinx.coroutines.CoroutineStart.LAZY) {
            synthesize(operation, text)
        }
        val previous = synchronized(operationLock) {
            val old = activeOperation
            operation.job = job
            activeOperation = operation
            operations.add(operation)
            old
        }
        previous?.let(::cancelOperation)
        job.start()
        runBlocking {
            job.join()
        }
    }

    override fun onStop() {
        val operation = synchronized(operationLock) {
            val current = activeOperation
            if (current != null) {
                current.cancelled = true
                activeOperation = null
            }
            current
        }
        operation?.let(::cancelOperation)
    }

    private suspend fun synthesize(operation: SynthesisOperation, text: String) {
        try {
            val ready = withTimeout(TimeUnit.SECONDS.toMillis(10)) { ttsReady.await() }
            check(ready) { "Internal TTS is unavailable" }
            ensureActive(operation)

            val segments = pipeline?.processSegments(text)
                ?: listOf(SpeechSegment(text, SpeechLanguage.ENGLISH))
            ensureActive(operation)
            check(segments.isNotEmpty()) { "No speech segments were produced" }

            segments.forEachIndexed { index, segment ->
                if (segment.text.isBlank()) return@forEachIndexed
                ensureActive(operation)
                val file = File.createTempFile("sheng_proxy_", ".wav", cacheDir)
                val result = CompletableDeferred<Boolean>()
                val utteranceId = "sheng_proxy_${System.nanoTime()}_$index"
                synchronized(operationLock) {
                    ensureActiveLocked(operation)
                    operation.files += file
                    operation.currentFile = file
                    operation.currentUtteranceId = utteranceId
                    operation.synthesisResult = result
                    operation.synthesisStarted = true
                    operation.synthesisTerminal = false
                }

                val listener = object : UtteranceProgressListener() {
                    override fun onStart(id: String?) = Unit

                    override fun onDone(id: String?) {
                        if (id == utteranceId) markSynthesisTerminal(operation, utteranceId, true)
                    }

                    override fun onError(id: String?) {
                        if (id == utteranceId) markSynthesisTerminal(operation, utteranceId, false)
                    }

                    override fun onError(id: String?, errorCode: Int) {
                        if (id == utteranceId) markSynthesisTerminal(operation, utteranceId, false)
                    }

                    override fun onStop(id: String?, interrupted: Boolean) {
                        if (id == utteranceId) markSynthesisTerminal(operation, utteranceId, false)
                    }
                }

                val synthesisStatus = synchronized(operationLock) {
                    ensureActiveLocked(operation)
                    val tts = internalTts ?: error("Internal TTS is unavailable")
                    val locale = setSpeechLanguage(tts, segment.language)
                    Log.i(
                        tag,
                        "Synthesizing ${segment.language} segment with $locale (${segment.text.length} characters)"
                    )
                    tts.setOnUtteranceProgressListener(listener)
                    tts.synthesizeToFile(segment.text, android.os.Bundle(), file, utteranceId)
                }
                if (synthesisStatus != TextToSpeech.SUCCESS) {
                    markSynthesisTerminal(operation, utteranceId, false)
                    error("Internal TTS rejected the synthesis request: $synthesisStatus")
                }

                if (result.await().not()) {
                    ensureActive(operation)
                    error("Internal TTS could not synthesize the utterance")
                }
                ensureActive(operation)
                streamWaveFile(operation, file)
            }

            synchronized(operationLock) {
                ensureActiveLocked(operation)
                operation.callbackFinished = true
                operation.callback.done()
            }
        } catch (e: CancellationException) {
            // onStop() owns cancellation; do not report a stopped utterance as a failure.
        } catch (e: Exception) {
            Log.e(tag, "Synthesis failed", e)
            reportError(operation)
        } finally {
            synchronized(operationLock) { operation.consumerFinished = true }
            cleanupIfSafe(operation)
        }
    }

    private fun markSynthesisTerminal(
        operation: SynthesisOperation,
        utteranceId: String,
        succeeded: Boolean
    ) {
        val deleteFile = synchronized(operationLock) {
            if (operation.currentUtteranceId != utteranceId) return
            operation.synthesisTerminal = true
            operation.synthesisResult?.complete(succeeded)
            operation.cancelled && operation.consumerFinished
        }
        if (deleteFile) {
            operation.files.forEach(File::delete)
            cleanupIfSafe(operation)
        }
    }

    private fun streamWaveFile(operation: SynthesisOperation, file: File) {
        RandomAccessFile(file, "r").use { wave ->
            val format = readWaveFormat(wave)
            synchronized(operationLock) {
                ensureActiveLocked(operation)
                if (!operation.callbackStarted) {
                    val result = operation.callback.start(
                        format.sampleRate,
                        AudioFormat.ENCODING_PCM_16BIT,
                        format.channels
                    )
                    check(result == TextToSpeech.SUCCESS) { "Synthesis callback rejected audio" }
                    operation.callbackStarted = true
                    operation.sampleRate = format.sampleRate
                    operation.channels = format.channels
                } else {
                    check(
                        operation.sampleRate == format.sampleRate &&
                            operation.channels == format.channels
                    ) { "TTS voices returned incompatible audio formats" }
                }
            }

            wave.seek(format.dataOffset)
            var remaining = format.dataSize
            val frameSize = format.channels * 2
            val buffer = ByteArray(8192 - (8192 % frameSize))
            while (remaining > 0) {
                val count = minOf(buffer.size, remaining)
                val read = wave.read(buffer, 0, count)
                check(read == count) { "Unexpected end of WAV data" }
                synchronized(operationLock) {
                    ensureActiveLocked(operation)
                    val result = operation.callback.audioAvailable(buffer, 0, read)
                    check(result == TextToSpeech.SUCCESS) { "Synthesis callback rejected audio data" }
                }
                remaining -= read
            }
        }
    }

    private fun setSpeechLanguage(tts: TextToSpeech, language: SpeechLanguage): java.util.Locale {
        val requested = java.util.Locale(language.language, language.country)
        var status = tts.setLanguage(requested)
        if (status >= TextToSpeech.LANG_AVAILABLE) return requested

        if (language == SpeechLanguage.SWAHILI) {
            val swahili = java.util.Locale("sw")
            status = tts.setLanguage(swahili)
            if (status >= TextToSpeech.LANG_AVAILABLE) return swahili
        }

        val fallback = java.util.Locale.US
        tts.setLanguage(fallback)
        Log.w(tag, "Requested $language voice unavailable; using $fallback")
        return fallback
    }

    private data class WaveFormat(
        val sampleRate: Int,
        val channels: Int,
        val dataOffset: Long,
        val dataSize: Int
    )

    private fun readWaveFormat(file: RandomAccessFile): WaveFormat {
        require(file.length() >= 12) { "Invalid WAV file" }
        require(readFourCc(file) == "RIFF") { "Unsupported WAV container" }
        readLittleEndianInt(file)
        require(readFourCc(file) == "WAVE") { "Unsupported WAV container" }

        var sampleRate: Int? = null
        var channels: Int? = null
        var dataOffset: Long? = null
        var dataSize: Int? = null
        while (file.filePointer + 8 <= file.length()) {
            val chunkStart = file.filePointer
            val chunkId = readFourCc(file)
            val chunkSize = readLittleEndianInt(file)
            require(chunkSize >= 0 && chunkStart + 8 + chunkSize <= file.length()) {
                "Invalid WAV chunk size"
            }
            when (chunkId) {
                "fmt " -> {
                    require(chunkSize >= 16) { "Invalid WAV format chunk" }
                    val encoding = readLittleEndianShort(file)
                    val channelCount = readLittleEndianShort(file)
                    val rate = readLittleEndianInt(file)
                    readLittleEndianInt(file)
                    val blockAlign = readLittleEndianShort(file)
                    val bitsPerSample = readLittleEndianShort(file)
                    require(encoding == 1 && bitsPerSample == 16) {
                        "Only 16-bit PCM WAV output is supported"
                    }
                    require(channelCount in 1..2 && rate > 0 && blockAlign == channelCount * 2) {
                        "Unsupported WAV audio format"
                    }
                    channels = channelCount
                    sampleRate = rate
                }
                "data" -> {
                    dataOffset = file.filePointer
                    dataSize = chunkSize
                }
            }
            file.seek(chunkStart + 8 + chunkSize + (chunkSize and 1))
            if (sampleRate != null && dataOffset != null) break
        }

        val finalChannels = channels ?: error("WAV format chunk is missing")
        val finalDataSize = dataSize ?: error("WAV data chunk is missing")
        require(finalDataSize % (finalChannels * 2) == 0) { "Incomplete PCM sample frame" }
        return WaveFormat(sampleRate ?: error("WAV sample rate is missing"), finalChannels,
            dataOffset ?: error("WAV data chunk is missing"), finalDataSize)
    }

    private fun readFourCc(file: RandomAccessFile): String {
        val bytes = ByteArray(4)
        file.readFully(bytes)
        return String(bytes, Charsets.US_ASCII)
    }

    private fun readLittleEndianShort(file: RandomAccessFile): Int {
        val low = file.readUnsignedByte()
        val high = file.readUnsignedByte()
        return low or (high shl 8)
    }

    private fun readLittleEndianInt(file: RandomAccessFile): Int {
        val b0 = file.readUnsignedByte()
        val b1 = file.readUnsignedByte()
        val b2 = file.readUnsignedByte()
        val b3 = file.readUnsignedByte()
        return b0 or (b1 shl 8) or (b2 shl 16) or (b3 shl 24)
    }

    private fun ensureActive(operation: SynthesisOperation) {
        synchronized(operationLock) { ensureActiveLocked(operation) }
    }

    private fun ensureActiveLocked(operation: SynthesisOperation) {
        check(!operation.cancelled && activeOperation === operation) {
            "Synthesis was cancelled"
        }
    }

    private fun reportError(operation: SynthesisOperation) {
        synchronized(operationLock) {
            if (operation.cancelled || activeOperation !== operation || operation.callbackFinished) {
                return
            }
            operation.callbackFinished = true
            operation.callback.error()
        }
    }

    private fun cleanupIfSafe(operation: SynthesisOperation) {
        val mayDelete = synchronized(operationLock) {
            val safe = !operation.synthesisStarted ||
                    (operation.synthesisTerminal && operation.consumerFinished)
            if (safe) operations.remove(operation)
            safe
        }
        if (mayDelete) operation.files.forEach(File::delete)
        synchronized(operationLock) {
            if (activeOperation === operation) activeOperation = null
        }
    }

    private fun cancelOperation(operation: SynthesisOperation) {
        val shouldStop = synchronized(operationLock) {
            operation.cancelled = true
            operation.job?.cancel()
            operation.synthesisStarted && !operation.synthesisTerminal
        }
        if (shouldStop) {
            try {
                internalTts?.stop()
            } catch (e: Exception) {
                Log.w(tag, "Could not stop internal TTS", e)
            }
        }
        cleanupIfSafe(operation)
    }

    override fun onDestroy() {
        onStop()
        val pendingOperations = synchronized(operationLock) { operations.toList() }
        ttsReady.complete(false)
        try {
            internalTts?.shutdown()
        } catch (e: Exception) {
            Log.e(tag, "Internal TTS shutdown failed", e)
        }
        pendingOperations.forEach {
            it.currentUtteranceId?.let { utteranceId ->
                markSynthesisTerminal(it, utteranceId, false)
            }
            cleanupIfSafe(it)
        }
        scope.cancel()
        super.onDestroy()
    }
}
