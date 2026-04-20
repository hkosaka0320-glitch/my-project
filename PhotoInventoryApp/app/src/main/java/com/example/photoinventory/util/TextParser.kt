package com.example.photoinventory.util

import com.example.photoinventory.data.InventoryItem

/**
 * OCRテキストを解析して在庫アイテムのリストを生成するパーサー。
 *
 * 対応フォーマット:
 *   - タブ/複数スペース区切りの表形式テキスト
 *   - "列名:値" 形式のキー・バリュー形式
 *
 * 品番フィルタ:
 *   パターン: [A-Z0-9]{4}T[A-Z0-9](200-650)
 *   例: ABCDT1350, XYZWTA500
 */
object TextParser {

    // 品番パターン: 4文字+T+1文字+3桁数字(200-650)
    private val HINBAN_FULL = Regex("""[A-Z0-9]{4}T[A-Z0-9]([2-5]\d{2}|6[0-4]\d|650)""")

    // ヘッダー候補キーワード
    private val HEADER_KEYWORDS = listOf("品番", "ヒンバン", "品　番")

    fun parseOcrText(rawText: String): List<InventoryItem> {
        val lines = rawText.lines().map { it.trim() }.filter { it.isNotBlank() }
        if (lines.isEmpty()) return emptyList()

        // ヘッダー行を探す
        val headerIdx = lines.indexOfFirst { line ->
            HEADER_KEYWORDS.any { line.contains(it) }
        }

        return if (headerIdx >= 0) {
            parseTableFormat(lines, headerIdx)
        } else {
            parseKeyValueFormat(lines)
        }
    }

    // ─── タブ/スペース区切りの表形式解析 ────────────────────────────────────
    private fun parseTableFormat(lines: List<String>, headerIdx: Int): List<InventoryItem> {
        val headers = splitColumns(lines[headerIdx])
        val naiCol     = headers.indexOfFirst { it.contains("内") }
        val hinbanCol  = headers.indexOfFirst { it.contains("品番") || it.contains("ヒンバン") }
        val nokiCol    = headers.indexOfFirst { it.contains("納期") }
        val nyusakiCol = headers.indexOfFirst { it.contains("納入先") || it.contains("納先") }

        val items = mutableListOf<InventoryItem>()
        for (i in (headerIdx + 1) until lines.size) {
            val cols = splitColumns(lines[i])
            if (cols.isEmpty()) continue

            val nai     = cols.getOrElse(naiCol) { "" }
            val hinban  = cols.getOrElse(hinbanCol) { "" }
            val noki    = cols.getOrElse(nokiCol) { "" }
            val nyusaki = cols.getOrElse(nyusakiCol) { "" }

            // "内"列が NL: で始まる行は除外 (手順3)
            if (nai.startsWith("NL:")) continue
            if (hinban.isBlank()) continue

            items.add(InventoryItem(nai = nai, hinban = hinban, noki = noki, nyusaki = nyusaki))
        }
        return items
    }

    // ─── キー:値 形式の解析 ──────────────────────────────────────────────────
    private fun parseKeyValueFormat(lines: List<String>): List<InventoryItem> {
        val items = mutableListOf<InventoryItem>()
        var nai = ""; var hinban = ""; var noki = ""; var nyusaki = ""

        fun flush() {
            if (hinban.isNotBlank() && !nai.startsWith("NL:")) {
                items.add(InventoryItem(nai = nai, hinban = hinban, noki = noki, nyusaki = nyusaki))
            }
            nai = ""; hinban = ""; noki = ""; nyusaki = ""
        }

        for (line in lines) {
            when {
                line.matches(Regex("""^内[：:].+"""))    -> nai     = extractValue(line)
                line.matches(Regex("""^品番[：:].+"""))  -> { flush(); hinban  = extractValue(line) }
                line.matches(Regex("""^納期[：:].+"""))  -> noki    = extractValue(line)
                line.matches(Regex("""^納入先[：:].+"""))-> { nyusaki = extractValue(line); flush() }
                else -> {
                    // 行の中から品番パターンを自動検出
                    val m = HINBAN_FULL.find(line)
                    if (m != null) { flush(); hinban = m.value }
                }
            }
        }
        flush()
        return items
    }

    // ─── 品番フィルタ (手順4): ????T?(200-650) のみ残す ─────────────────────
    fun filterByPartNumber(items: List<InventoryItem>): List<InventoryItem> =
        items.filter { HINBAN_FULL.containsMatchIn(it.hinban.uppercase()) }

    // ─── 集計 (手順7): 品番末尾数字ごとにカウント ───────────────────────────
    fun aggregateByNumberSuffix(items: List<InventoryItem>): Map<String, Int> {
        val counts = mutableMapOf<String, Int>()
        for (item in items) {
            val m = HINBAN_FULL.find(item.hinban.uppercase()) ?: continue
            val suffix = m.groupValues[1]
            counts[suffix] = (counts[suffix] ?: 0) + 1
        }
        return counts.toSortedMap(compareBy { it.toIntOrNull() ?: 0 })
    }

    // ─── ユーティリティ ──────────────────────────────────────────────────────
    private fun splitColumns(line: String): List<String> =
        line.split(Regex("""\t|\s{2,}|[|｜,，]"""))
            .map { it.trim() }
            .filter { it.isNotEmpty() }

    private fun extractValue(line: String): String =
        line.substringAfter(":").substringAfter("：").trim()
}
