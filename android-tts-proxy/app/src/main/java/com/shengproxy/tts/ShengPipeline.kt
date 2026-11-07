package com.shengproxy.tts

enum class SpeechLanguage(val language: String, val country: String) {
    ENGLISH("en", "US"),
    SWAHILI("sw", "KE")
}

data class SpeechSegment(val text: String, val language: SpeechLanguage)

class ShengPipeline {

    private val swahiliWords = setOf(
        "aje", "asante", "bado", "basi", "bila", "bora", "chakula", "chini",
        "hapana", "habari", "hapa", "hapo", "hawa", "hii", "hizi", "hiyo", "hivyo",
        "huko", "huku", "jana", "je", "juu", "kama", "kesho", "kidogo", "kwa",
        "kweli", "lakini", "leo", "maji", "mimi", "mtu", "mtoto", "mzuri", "na",
        "nani", "ndiyo", "niko", "nime", "nini", "nyumba", "pale", "pole", "rafiki",
        "sana", "sasa", "siku", "siko", "sisi", "tafadhali", "tunataka", "tuna",
        "tuko", "una", "unafanya", "unataka", "unaweza", "uko", "vizuri", "wao",
        "wapi", "wako", "wame", "watu", "wewe", "ya", "yako", "yangu", "yeye", "zao"
    )

    fun processText(input: String): String =
        processSegments(input).joinToString(separator = "") { it.text }

    fun processSegments(
        input: String,
        lookup: (String) -> LexiconPronunciation? = LexiconManager::lookup
    ): List<SpeechSegment> {
        val result = mutableListOf<SpeechSegment>()
        val pending = StringBuilder()
        val words = Regex("[\\p{L}\\p{M}\\p{N}]+(?:['’-][\\p{L}\\p{M}\\p{N}]+)*")
        var cursor = 0

        fun append(language: SpeechLanguage, text: String) {
            if (text.isEmpty()) return
            val combinedText = pending.toString() + text
            pending.setLength(0)
            val last = result.lastOrNull()
            if (last?.language == language) {
                result[result.lastIndex] = last.copy(text = last.text + combinedText)
            } else {
                result += SpeechSegment(combinedText, language)
            }
        }

        for (match in words.findAll(input)) {
            pending.append(input, cursor, match.range.first)
            val sourceWord = match.value
            val lowerWord = sourceWord.lowercase()
            val pronunciation = lookup(lowerWord)
            val language: SpeechLanguage
            val outputWord: String

            if (lowerWord in swahiliWords) {
                language = SpeechLanguage.SWAHILI
                outputWord = pronunciation?.swahili ?: sourceWord
            } else if (pronunciation != null) {
                language = SpeechLanguage.ENGLISH
                outputWord = preserveInitialCapitalization(sourceWord, pronunciation.english)
            } else {
                language = SpeechLanguage.ENGLISH
                outputWord = sourceWord
            }

            append(language, outputWord)
            cursor = match.range.last + 1
        }

        pending.append(input, cursor, input.length)
        if (result.isNotEmpty() && pending.isNotEmpty()) {
            val last = result.last()
            result[result.lastIndex] = last.copy(text = last.text + pending)
        } else if (pending.isNotEmpty()) {
            result += SpeechSegment(pending.toString(), SpeechLanguage.ENGLISH)
        }
        return result
    }

    private fun preserveInitialCapitalization(source: String, pronunciation: String): String {
        if (source.firstOrNull()?.isUpperCase() != true) return pronunciation
        return pronunciation.replaceFirstChar { it.uppercase() }
    }
}
