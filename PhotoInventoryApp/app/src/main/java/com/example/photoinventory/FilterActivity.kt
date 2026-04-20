package com.example.photoinventory

import android.content.Intent
import android.os.Bundle
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import com.example.photoinventory.adapter.FilterOptionAdapter
import com.example.photoinventory.data.AppDatabase
import com.example.photoinventory.databinding.ActivityFilterBinding
import kotlinx.coroutines.launch

/**
 * 手順5: 納期・納入先のユニーク値をチェックボックス付きで表示する。
 */
class FilterActivity : AppCompatActivity() {

    private lateinit var binding: ActivityFilterBinding
    private lateinit var nokiAdapter: FilterOptionAdapter
    private lateinit var nyusakiAdapter: FilterOptionAdapter
    private var sessionId = 0L

    companion object {
        const val EXTRA_SESSION_ID = "SESSION_ID"
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityFilterBinding.inflate(layoutInflater)
        setContentView(binding.root)

        sessionId = intent.getLongExtra(EXTRA_SESSION_ID, 0L)
        if (sessionId == 0L) { finish(); return }

        nokiAdapter = FilterOptionAdapter()
        nyusakiAdapter = FilterOptionAdapter()

        binding.rvNoki.layoutManager = LinearLayoutManager(this)
        binding.rvNoki.adapter = nokiAdapter

        binding.rvNyusaki.layoutManager = LinearLayoutManager(this)
        binding.rvNyusaki.adapter = nyusakiAdapter

        loadOptions()

        binding.btnShowResult.setOnClickListener { proceedToResult() }
        binding.btnBack.setOnClickListener { finish() }
    }

    private fun loadOptions() {
        lifecycleScope.launch {
            val items = AppDatabase.getDatabase(this@FilterActivity)
                .inventoryDao()
                .getItemsBySession(sessionId)

            // 重複なしで表示 (手順5)
            nokiAdapter.setOptions(items.map { it.noki }.distinct().sorted())
            nyusakiAdapter.setOptions(items.map { it.nyusaki }.distinct().sorted())

            binding.tvItemCount.text = "抽出件数: ${items.size} 件"
        }
    }

    private fun proceedToResult() {
        val selectedNoki    = nokiAdapter.getCheckedItems()
        val selectedNyusaki = nyusakiAdapter.getCheckedItems()

        if (selectedNoki.isEmpty() && selectedNyusaki.isEmpty()) {
            Toast.makeText(this, "納期または納入先を1つ以上選択してください", Toast.LENGTH_SHORT).show()
            return
        }

        val intent = Intent(this, ResultActivity::class.java).apply {
            putExtra(ResultActivity.EXTRA_SESSION_ID, sessionId)
            putStringArrayListExtra(ResultActivity.EXTRA_NOKI, ArrayList(selectedNoki))
            putStringArrayListExtra(ResultActivity.EXTRA_NYUSAKI, ArrayList(selectedNyusaki))
        }
        startActivity(intent)
    }
}
