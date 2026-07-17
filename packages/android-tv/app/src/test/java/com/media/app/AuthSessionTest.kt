package com.media.app

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class AuthSessionTest {
    @Test
    fun cookieLookupUrls_includesPathAndOriginVariants() {
        val urls = AuthSession.cookieLookupUrls("https://media.example.com/reel")
        assertTrue(urls.contains("https://media.example.com/reel"))
        assertTrue(urls.contains("https://media.example.com/reel/"))
        assertTrue(urls.contains("https://media.example.com"))
        assertTrue(urls.contains("https://media.example.com/"))
        assertEquals(4, urls.size)
    }
}
