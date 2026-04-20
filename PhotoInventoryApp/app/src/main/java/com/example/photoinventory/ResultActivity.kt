package com.example.photoinventory

import android.content.Intent
import android.os.Bundle
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import com.example.photoinventory.adapter.InventoryAdapter
import com.example.photoinventory.data.AppDatabase
import com.example.photoinventory.data.InventoryItem
import com.example.photoinventory.databinding.ActivityResultBinding
import kotlinx.coroutines.launch

/**
 * 手順6: チェックが入っている納期・納入先に該当するアイテムを表示する。
 */
class ResultActivity : AppCompatActivity() {

    private lateinit var binding: ActivityResultBinding
    private lateinit var adapter: InventoryAdapter

    private var sessionId = 0L
    private var selectedNoki    = emptyList<String>()
    private var selectedNyusaki = emptyList<String>()

    companion object {
        const val EXTRA_SESSION_ID = "SESSION_ID"
        const val EXTRA_NOKI       = "SELECTED_NOKI"
        const val EXTRA_NYUSAKI    = "SELECTED_NYUSAKI"
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityResultBinding.inflate(layoutInflater)
        setContentView(binding.root)

        sessionId       = intent.getLongExtra(EXTRA_SESSION_ID, 0L)
        selectedNoki    = intent.getStringArrayListExtra(EXTRA_NOKI) ?: emptyList()
        selectedNyusaki = intent.getStringArrayListExtra(EXTRA_NYUSAKI) ?: emptyList()

        adapter = InventoryAdapter()
        binding.rvItems.layoutManager = LinearLayoutManager(this)
        binding.rvItems.adapter = adapter

        loadFilteredItems()

        // 手順7: OKで集計画面へ
        binding.btnOk.setOnClickListener { goToSummary() }
        binding.btnBack.setOnClickListener { finish() }
    }

    private fun loadFilteredItems() {
        lifecycleScope.launch {
            val all = AppDatabase.getDatabase(this@ResultActivity)
                .inventoryDao()
                .getItemsBySession(sessionId)

            val filtered = all.filter { matchesFilter(it) }
            adapter.setItems(filtered)
            binding.tvCount.text = "表示件数: ${filtered.size} 件"
        }
    }

    private fun matchesFilter(item: InventoryItem): Boolean {
        val nokiOk    = selectedNoki.isEmpty()    || item.noki    in selectedNoki
        val nyusakiOk = selectedNyusaki.isEmpty() || item.nyusaki in selectedNyusaki
        return nokiOk && nyusakiOk
    }

    private fun goToSummary() {
        val intent = Intent(this, SummaryActivity::class.java).apply {
            putExtra(SummaryActivity.EXTRA_SESSION_ID, sessionId)
            putStringArrayListExtra(SummaryActivity.EXTRA_NOKI, ArrayList(selectedNoki))
            putStringArrayListExtra(SummaryActivity.EXTRA_NYUSAKI, ArrayList(selectedNyusaki))
        }
        startActivity(intent)
    }
}
