package com.shengproxy.tts

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import kotlinx.coroutines.runBlocking

class ShengPipelineTest {

    private val pipeline = ShengPipeline(null)
    private val lexicon = mapOf("jambo" to "JAMBO", "dunia" to "DUNIA")

    @Test
    fun quickLexiconPassPreservesWhitespaceAndPunctuation() {
        val input = "\tJambo,   dunia!\n"

        val result = pipeline.quickLexiconPass(input) { lexicon[it] }

        assertEquals("\tJAMBO,   DUNIA!\n", result)
    }

    @Test
    fun quickLexiconPassFallsBackWhenAWordIsUnknown() {
        assertNull(pipeline.quickLexiconPass("Jambo, stranger!") { lexicon[it] })
    }

    @Test
    fun onlineFallbackIsRequestedOnlyForWordsMissingFromTheLexicon() = runBlocking {
        var requested = emptyList<String>()
        var sentContext = ""
        val online = object : UnknownWordPronouncer {
            override suspend fun pronounce(
                words: List<String>,
                phraseContext: String
            ): Map<String, PronunciationHint> {
                requested = words
                sentContext = phraseContext
                return mapOf(
                    "stranger" to PronunciationHint("stray-nger", SpeechLanguage.ENGLISH)
                )
            }
        }
        val localLexicon = mapOf("jambo" to "JAM-bo")
        val onlinePipeline = ShengPipeline(online) { localLexicon[it.lowercase()] }

        val output = onlinePipeline.processText("Jambo, stranger!")

        assertEquals("JAM-bo, stray-nger!", output)
        assertEquals(listOf("stranger"), requested)
        assertEquals("[known], stranger!", sentContext)
    }

    @Test
    fun onlineLanguageHintsSplitSpeechIntoLanguageSegments() = runBlocking {
        val online = object : UnknownWordPronouncer {
            override suspend fun pronounce(
                words: List<String>,
                phraseContext: String
            ) = mapOf(
                "msee" to PronunciationHint("m-say", SpeechLanguage.SWAHILI),
                "form" to PronunciationHint("form", SpeechLanguage.ENGLISH)
            )
        }
        val onlinePipeline = ShengPipeline(online) { null }

        assertEquals(
            listOf(
                SpeechSegment("m-say ", SpeechLanguage.SWAHILI),
                SpeechSegment("form!", SpeechLanguage.ENGLISH)
            ),
            onlinePipeline.processSegments("msee form!")
        )
    }
}
