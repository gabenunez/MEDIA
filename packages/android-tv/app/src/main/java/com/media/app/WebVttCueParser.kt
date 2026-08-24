package com.media.app

data class WebVttCue(
    val startSeconds: Double,
    val endSeconds: Double,
    val text: String,
)

object WebVttCueParser {
    fun parse(vtt: String): List<WebVttCue> {
        val normalized = vtt.replace("\r\n", "\n").trim()
        if (normalized.isEmpty()) return emptyList()

        val cues = mutableListOf<WebVttCue>()
        for (block in normalized.split(Regex("\n\\s*\n"))) {
            val lines =
                block.split("\n")
                    .map { it.trim() }
                    .filter { it.isNotEmpty() }
            if (lines.isEmpty()) continue

            val header = lines[0].uppercase()
            if (header.startsWith("WEBVTT") && !block.contains("-->")) continue
            if (header.startsWith("NOTE") || header.startsWith("STYLE") || header.startsWith("REGION")) {
                continue
            }

            val timeLineIndex = lines.indexOfFirst { it.contains("-->") }
            if (timeLineIndex == -1) continue

            val match = TIME_LINE.matchEntire(lines[timeLineIndex]) ?: continue
            val start = parseTimestamp(match.groupValues[1])
            val end = parseTimestamp(match.groupValues[2])
            if (!start.isFinite() || !end.isFinite() || end <= start) continue

            val text =
                lines
                    .drop(timeLineIndex + 1)
                    .filter { !isCueSettingLine(it) && !it.matches(Regex("^\\d+$")) }
                    .map { stripMarkup(it) }
                    .filter { it.isNotEmpty() }
                    .joinToString("\n")
                    .trim()
            if (text.isEmpty()) continue

            cues += WebVttCue(start, end, text)
        }
        return cues
    }

    fun activeTexts(cues: List<WebVttCue>, timeSeconds: Double): List<String> {
        if (!timeSeconds.isFinite() || cues.isEmpty()) return emptyList()
        return cues.mapNotNull { cue ->
            if (timeSeconds >= cue.startSeconds && timeSeconds < cue.endSeconds) cue.text else null
        }
    }

    fun parseTimestamp(value: String): Double {
        val trimmed = value.trim()
        val segments = trimmed.split(":")
        if (segments.size == 2) {
            val minutes = segments[0].toIntOrNull() ?: return 0.0
            val (seconds, millis) = splitSeconds(segments[1])
            return minutes * 60.0 + seconds + millis / 1000.0
        }
        if (segments.size == 3) {
            val hours = segments[0].toIntOrNull() ?: return 0.0
            val minutes = segments[1].toIntOrNull() ?: return 0.0
            val (seconds, millis) = splitSeconds(segments[2])
            return hours * 3600.0 + minutes * 60.0 + seconds + millis / 1000.0
        }
        return 0.0
    }

    private fun splitSeconds(value: String): Pair<Int, Int> {
        val parts = value.split(".", limit = 2)
        val seconds = parts[0].toIntOrNull() ?: 0
        val millis = (parts.getOrNull(1) ?: "0").padEnd(3, '0').take(3).toIntOrNull() ?: 0
        return seconds to millis
    }

    private fun stripMarkup(text: String): String = text.replace(Regex("<[^>]+>"), "").trim()

    private fun isCueSettingLine(line: String): Boolean =
        SETTING_LINE.containsMatchIn(line)

    private val TIME_LINE = Regex("^(.+?)\\s+-->\\s+(.+?)(\\s+.*)?$")
    private val SETTING_LINE = Regex("^(align|line|position|region|size|vertical):", RegexOption.IGNORE_CASE)
}
