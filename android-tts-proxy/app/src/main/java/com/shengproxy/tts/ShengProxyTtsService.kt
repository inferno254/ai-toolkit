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
import java.util.Locale
import java.util.concurrent.TimeUnit
import kotlin.math.ceil
import kotlin.math.roundToInt

class ShengProxyTtsService : TextToSpeechService() {

    private data class LanguageSelection(
        val requestedLocaleAvailable: Boolean,
        val selectedLocale: Locale,
        val status: Int
    )

    private companion object {
        const val OUTPUT_SAMPLE_RATE = 22050
        const val OUTPUT_CHANNELS = 1
        const val LANGUAGE_SWITCH_SILENCE_BYTES = 2204
    }

    private val tag = "ShengProxyTtsService"
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val operationLock = Any()
    private val ttsReady = CompletableDeferred<Boolean>()
    private val operations = mutableSetOf<SynthesisOperation>()

    private var internalTts: TextToSpeech? = null
    private var pipeline: ShengPipeline? = null
    private var activeOperation: SynthesisOperation? = null

    private class SynthesisOperation(val callback: SynthesisCallback) {
        var job: Job? = null
        val files = mutableListOf<File>()
        var currentUtteranceId: String? = null
        var synthesisResult: CompletableDeferred<Boolean>? = null
        var cancelled = false
        var synthesisStarted = false
        var synthesisTerminal = false
        var consumerFinished = false
        var callbackFinished = false
    }

    override fun onCreate() {
        super.onCreate()
        try {
            LexiconManager.initialize(this)
            pipeline = ShengPipeline()

            val tts = TextToSpeech(this, { status ->
                val ready = status == TextToSpeech.SUCCESS
                if (ready) {
                    Log.d(tag, "Internal TTS initialized")
                    val swahiliVoices = internalTts?.voices.orEmpty()
                        .filter { it.locale.language == "sw" }
                        .joinToString { "${it.name} (${it.locale})" }
                    Log.i(
                        tag,
                        if (swahiliVoices.isBlank()) "No installed Kiswahili voices reported by Google TTS"
                        else "Installed Kiswahili voices: $swahiliVoices"
                    )
                } else {
                    Log.e(tag, "Internal TTS initialization failed: $status")
                }
                ttsReady.complete(ready)
            }, "com.google.android.tts")
            tts.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
                override fun onStart(id: String?) = Unit
                override fun onDone(id: String?) {
                    id?.let { markSynthesisTerminal(it, true) }
                }
                override fun onError(id: String?) {
                    id?.let { markSynthesisTerminal(it, false) }
                }
                override fun onError(id: String?, errorCode: Int) {
                    id?.let { markSynthesisTerminal(it, false) }
                }
                override fun onStop(id: String?, interrupted: Boolean) {
                    id?.let { markSynthesisTerminal(it, false) }
                }
            })
            internalTts = tts
        } catch (e: Exception) {
            ttsReady.complete(false)
            Log.e(tag, "Service creation failed", e)
        }
    }

    override fun onIsLanguageAvailable(lang: String?, country: String?, variant: String?): Int =
        if (lang.equals("eng", ignoreCase = true) ||
            lang.equals("en", ignoreCase = true) ||
            lang.equals("swa", ignoreCase = true) ||
            lang.equals("sw", ignoreCase = true)
        ) {
            TextToSpeech.LANG_AVAILABLE
        } else {
            TextToSpeech.LANG_NOT_SUPPORTED
        }

    override fun onLoadLanguage(lang: String?, country: String?, variant: String?): Int =
        onIsLanguageAvailable(lang, country, variant)

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

            val segments = pipeline?.processSegments(text).orEmpty().filter { it.text.isNotBlank() }
            ensureActive(operation)

            synchronized(operationLock) {
                ensureActiveLocked(operation)
                val result = operation.callback.start(
                    OUTPUT_SAMPLE_RATE,
                    AudioFormat.ENCODING_PCM_16BIT,
                    OUTPUT_CHANNELS
                )
                check(result == TextToSpeech.SUCCESS) { "Synthesis callback rejected audio" }
            }

            var previousLanguage: SpeechLanguage? = null
            for (segment in segments) {
                ensureActive(operation)
                val file = synthesizeSegment(operation, segment)
                try {
                    if (previousLanguage != null && previousLanguage != segment.language) {
                        streamPcm(operation, ByteArray(LANGUAGE_SWITCH_SILENCE_BYTES))
                    }
                    streamPcm(operation, readNormalizedPcm(file))
                    previousLanguage = segment.language
                } finally {
                    file.delete()
                    synchronized(operationLock) { operation.files.remove(file) }
                }
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

    private suspend fun synthesizeSegment(
        operation: SynthesisOperation,
        segment: SpeechSegment
    ): File {
        val file = synchronized(operationLock) {
            ensureActiveLocked(operation)
            File.createTempFile("sheng_proxy_", ".wav", cacheDir).also(operation.files::add)
        }
        val utteranceId = "sheng_proxy_${System.nanoTime()}"
        val result = CompletableDeferred<Boolean>()
        val status = synchronized(operationLock) {
            ensureActiveLocked(operation)
            val tts = internalTts ?: error("Internal TTS is unavailable")
            val languageSelection = setSpeechLanguage(tts, segment.language)
            operation.currentUtteranceId = utteranceId
            operation.synthesisResult = result
            operation.synthesisStarted = true
            operation.synthesisTerminal = false
            val synthesisStatus = try {
                tts.synthesizeToFile(segment.text, android.os.Bundle(), file, utteranceId)
            } catch (e: Exception) {
                operation.synthesisTerminal = true
                result.complete(false)
                throw e
            }
            languageSelection to synthesisStatus
        }
        if (status.second != TextToSpeech.SUCCESS) {
            markSynthesisTerminal(utteranceId, false)
            error("Internal TTS rejected ${segment.language} synthesis: ${status.second}")
        }
        if (!status.first.requestedLocaleAvailable) {
            Log.w(
                tag,
                "Requested ${segment.language} locale is unavailable; selected ${status.first.selectedLocale}"
            )
        }
        Log.i(
            tag,
            "Synthesizing ${segment.language} span (${segment.text.length} characters) with ${status.first.selectedLocale}"
        )
        if (!result.await()) {
            ensureActive(operation)
            error("Internal TTS could not synthesize ${segment.language} text")
        }
        ensureActive(operation)
        return file
    }

    private fun setSpeechLanguage(tts: TextToSpeech, language: SpeechLanguage): LanguageSelection {
        val requested = Locale(language.language, language.country)
        var status = tts.setLanguage(requested)
        if (status >= TextToSpeech.LANG_AVAILABLE) {
            return LanguageSelection(true, requested, status)
        }

        if (language == SpeechLanguage.SWAHILI) {
            val swahili = Locale("sw")
            status = tts.setLanguage(swahili)
            if (status >= TextToSpeech.LANG_AVAILABLE) {
                return LanguageSelection(false, swahili, status)
            }
        }

        val fallback = Locale.US
        status = tts.setLanguage(fallback)
        return LanguageSelection(false, fallback, status)
    }

    private fun markSynthesisTerminal(utteranceId: String, succeeded: Boolean) {
        val operationToCleanup = synchronized(operationLock) {
            val operation = operations.firstOrNull { it.currentUtteranceId == utteranceId } ?: return
            operation.synthesisTerminal = true
            operation.synthesisResult?.complete(succeeded)
            operation.takeIf { it.cancelled && it.consumerFinished }
        }
        operationToCleanup?.let(::cleanupIfSafe)
    }

    private fun readNormalizedPcm(file: File): ByteArray {
        RandomAccessFile(file, "r").use { wave ->
            val format = readWaveFormat(wave)
            wave.seek(format.dataOffset)
            val frameCount = format.dataSize / (format.channels * 2)
            require(frameCount > 0) { "WAV contains no PCM frames" }
            val monoSamples = ShortArray(frameCount)
            repeat(frameCount) { frame ->
                var total = 0
                repeat(format.channels) { total += readSignedPcmSample(wave) }
                monoSamples[frame] = (total / format.channels).toShort()
            }

            val outputFrames = ceil(
                frameCount.toDouble() * OUTPUT_SAMPLE_RATE / format.sampleRate
            ).toInt().coerceAtLeast(1)
            val output = ByteArray(outputFrames * 2)
            repeat(outputFrames) { index ->
                val sourcePosition = index.toDouble() * format.sampleRate / OUTPUT_SAMPLE_RATE
                val lowerIndex = sourcePosition.toInt().coerceIn(0, frameCount - 1)
                val upperIndex = (lowerIndex + 1).coerceAtMost(frameCount - 1)
                val fraction = sourcePosition - lowerIndex
                val sample = (
                    monoSamples[lowerIndex] * (1.0 - fraction) +
                        monoSamples[upperIndex] * fraction
                    ).roundToInt().coerceIn(Short.MIN_VALUE.toInt(), Short.MAX_VALUE.toInt())
                output[index * 2] = (sample and 0xff).toByte()
                output[index * 2 + 1] = ((sample shr 8) and 0xff).toByte()
            }
            return output
        }
    }

    private fun streamPcm(operation: SynthesisOperation, pcm: ByteArray) {
        val chunkSize = 8192
        var offset = 0
        while (offset < pcm.size) {
            val count = minOf(chunkSize, pcm.size - offset)
            synchronized(operationLock) {
                ensureActiveLocked(operation)
                val result = operation.callback.audioAvailable(pcm, offset, count)
                check(result == TextToSpeech.SUCCESS) { "Synthesis callback rejected audio data" }
            }
            offset += count
        }
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

    private fun readSignedPcmSample(file: RandomAccessFile): Int {
        val sample = readLittleEndianShort(file)
        return if (sample >= 0x8000) sample - 0x10000 else sample
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
        if (operation.cancelled || activeOperation !== operation) {
            throw CancellationException("Synthesis was cancelled")
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
        val filesToDelete = synchronized(operationLock) {
            val safe = !operation.synthesisStarted ||
                    (operation.synthesisTerminal && operation.consumerFinished)
            if (!safe) return
            operations.remove(operation)
            operation.files.toList().also { operation.files.clear() }
        }
        filesToDelete.forEach(File::delete)
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
            it.currentUtteranceId?.let { id -> markSynthesisTerminal(id, false) }
            cleanupIfSafe(it)
        }
        scope.cancel()
        super.onDestroy()
    }
}
