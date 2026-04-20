package com.example.photoinventory

import android.os.Bundle
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.example.photoinventory.data.AppDatabase
import com.example.photoinventory.data.InventoryItem
import com.example.photoinventory.databinding.ActivitySummaryBinding
import com.example.photoinventory.util.TextParser
import kotlinx.coroutines.launch

/**
 * 手順7: 品番の末尾数字(200〜650)ごとに個数を集計して表示する。
 */
class SummaryActivity : AppCompatActivity() {

    private lateinit var binding: ActivitySummaryBinding

    companion object {
        const val EXTRA_SESSION_ID = "SESSION_ID"
        const val EXTRA_NOKI       = "SELECTED_NOKI"
        const val EXTRA_NYUSAKI    = "SELECTED_NYUSAKI"
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivitySummaryBinding.inflate(layoutInflater)
        setContentView(binding.root)

        val sessionId       = intent.getLongExtra(EXTRA_SESSION_ID, 0L)
        val selectedNoki    = intent.getStringArrayListExtra(EXTRA_NOKI) ?: emptyList<String>()
        val selectedNyusaki = intent.getStringArrayListExtra(EXTRA_NYUSAKI) ?: emptyList<String>()

        binding.btnBack.setOnClickListener { finish() }

        lifecycleScope.launch {
            val all = AppDatabase.getDatabase(this@SummaryActivity)
                .inventoryDao()
                .getItemsBySession(sessionId)

            val filtered = all.filter { item ->
                (selectedNoki.isEmpty()    || item.noki    in selectedNoki) &&
                (selectedNyusaki.isEmpty() || item.nyusaki in selectedNyusaki)
            }

            displaySummary(filtered)
        }
    }

    private fun displaySummary(items: List<InventoryItem>) {
        val counts = TextParser.aggregateByNumberSuffix(items)
        val sb = StringBuilder()

        sb.appendLine("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
        sb.appendLine("  品番集計結果")
        sb.appendLine("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")

        if (counts.isEmpty()) {
            sb.appendLine("  （該当データなし）")
        } else {
            counts.forEach { (suffix, count) ->
                sb.appendLine("  ????T?%-4s : %3d 個".format(suffix, count))
            }
            sb.appendLine("──────────────────────────────")
            sb.appendLine("  合　計       : %3d 個".format(counts.values.sum()))
        }

        sb.appendLine("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
        binding.tvSummary.text = sb.toString()
    }
}
