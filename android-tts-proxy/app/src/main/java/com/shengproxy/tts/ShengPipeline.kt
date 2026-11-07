package com.shengproxy.tts

import android.util.Log
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.TimeoutCancellationException

enum class SpeechLanguage(val language: String, val country: String) {
    ENGLISH("en", "US"),
    SWAHILI("sw", "KE")
}

data class SpeechSegment(val text: String, val language: SpeechLanguage)

class ShengPipeline(
    private val pronouncer: UnknownWordPronouncer?,
    private val lookup: (String) -> String? = LexiconManager::lookup
) {
    private val wordPattern = Regex("[\\p{L}\\p{N}]+")

    suspend fun processText(input: String): String =
        processSegments(input).joinToString(separator = "") { it.text }

    suspend fun processSegments(input: String): List<SpeechSegment> {
        if (input.isEmpty()) return emptyList()

        val tokens = Regex("\\s+|[\\p{L}\\p{N}]+|[^\\p{L}\\p{N}\\s]+")
            .findAll(input)
            .map { it.value }
            .toList()
        val unknownWords = tokens.asSequence()
            .filter { wordPattern.matches(it) && it.any(Char::isLetter) }
            .filter { lookup(it) == null }
            .distinctBy { it.lowercase() }
            .take(MAX_WORDS_PER_REQUEST)
            .toList()
        val hints = if (unknownWords.isNotEmpty() && pronouncer != null) {
            try {
                pronouncer.pronounce(
                    unknownWords,
                    redactKnownWords(input).take(MAX_CONTEXT_LENGTH)
                )
            } catch (error: TimeoutCancellationException) {
                Log.w(TAG, "Online pronunciation timed out; using offline text", error)
                emptyMap()
            } catch (error: CancellationException) {
                throw error
            } catch (error: Exception) {
                Log.w(TAG, "Online pronunciation unavailable; using offline text", error)
                emptyMap()
            }
        } else {
            emptyMap()
        }

        val output = mutableListOf<SpeechSegment>()
        var currentLanguage = SpeechLanguage.ENGLISH
        tokens.forEach { token ->
            val isWord = wordPattern.matches(token)
            val lowerWord = token.lowercase()
            val lexiconPronunciation = if (isWord) lookup(token) else null
            val hint = if (isWord && lexiconPronunciation == null) hints[lowerWord] else null
            val spokenText = lexiconPronunciation ?: hint?.phonetic ?: token
            val language = when {
                hint != null -> hint.language
                isWord && lowerWord in swahiliWords -> SpeechLanguage.SWAHILI
                else -> currentLanguage
            }
            appendSegment(output, spokenText, language)
            if (isWord) currentLanguage = language
        }
        return output
    }

    internal fun quickLexiconPass(
        input: String,
        lookup: (String) -> String? = this.lookup
    ): String? {
        val words = Regex("[\\p{L}\\p{N}]+").findAll(input)
        val result = StringBuilder()
        var cursor = 0
        for (word in words) {
            result.append(input, cursor, word.range.first)
            val replacement = lookup(word.value.lowercase()) ?: return null
            result.append(replacement)
            cursor = word.range.last + 1
        }
        if (cursor == 0) return null
        result.append(input, cursor, input.length)
        return result.toString()
    }

    private fun appendSegment(
        segments: MutableList<SpeechSegment>,
        text: String,
        language: SpeechLanguage
    ) {
        val previous = segments.lastOrNull()
        if (previous?.language == language) {
            segments[segments.lastIndex] = previous.copy(text = previous.text + text)
        } else {
            segments += SpeechSegment(text, language)
        }
    }

    private fun redactKnownWords(input: String): String =
        wordPattern.replace(input) { match ->
            if (lookup(match.value) != null) "[known]" else match.value
        }

    private companion object {
        const val TAG = "ShengPipeline"
        const val MAX_WORDS_PER_REQUEST = 20
        const val MAX_CONTEXT_LENGTH = 280
        val swahiliWords = setOf(
            "aje", "asante", "bado", "basi", "bila", "bora", "chakula", "chini",
            "habari", "hapa", "hapana", "hiyo", "hii", "huku", "jana", "je", "juu",
            "kama", "kesho", "kidogo", "kweli", "lakini", "leo", "maji", "mimi",
            "mtu", "mtoto", "mzuri", "nani", "ndiyo", "ndio", "niko", "nime", "nini",
            "nyumba", "pale", "pole", "rafiki", "sana", "sasa", "sawa", "siku",
            "siko", "sisi", "tafadhali", "tuna", "tunataka", "tuko", "uko", "una",
            "unafanya", "unataka", "unaweza", "vizuri", "wao", "wako", "wame", "wapi",
            "watu", "wewe", "yako", "yangu", "yeye"
        )
    }
}
