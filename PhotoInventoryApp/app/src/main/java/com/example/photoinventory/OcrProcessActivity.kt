package com.example.photoinventory

import android.content.Intent
import android.graphics.BitmapFactory
import android.os.Bundle
import android.view.View
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.example.photoinventory.data.AppDatabase
import com.example.photoinventory.databinding.ActivityOcrProcessBinding
import com.example.photoinventory.util.TextParser
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.japanese.JapaneseTextRecognizerOptions
import kotlinx.coroutines.launch

class OcrProcessActivity : AppCompatActivity() {

    private lateinit var binding: ActivityOcrProcessBinding

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityOcrProcessBinding.inflate(layoutInflater)
        setContentView(binding.root)

        val imagePath = intent.getStringExtra(CameraActivity.EXTRA_IMAGE_PATH)
        if (imagePath == null) {
            Toast.makeText(this, "画像パスが取得できませんでした", Toast.LENGTH_SHORT).show()
            finish()
            return
        }

        showProgress("OCR 解析中...")
        processImage(imagePath)
    }

    private fun processImage(path: String) {
        val bitmap = BitmapFactory.decodeFile(path) ?: run {
            showError("画像の読み込みに失敗しました")
            return
        }

        val recognizer = TextRecognition.getClient(JapaneseTextRecognizerOptions.Builder().build())
        recognizer.process(InputImage.fromBitmap(bitmap, 0))
            .addOnSuccessListener { result -> handleOcrResult(result.text) }
            .addOnFailureListener { e -> showError("OCR エラー: ${e.message}") }
    }

    private fun handleOcrResult(rawText: String) {
        lifecycleScope.launch {
            try {
                showProgress("データ解析中...")
                val parsed = TextParser.parseOcrText(rawText)
                // 手順4: 品番 ????T?(200-650) を抽出
                val filtered = TextParser.filterByPartNumber(parsed)

                if (filtered.isEmpty()) {
                    showError("該当する品番 (T○200〜T○650) が見つかりませんでした")
                    return@launch
                }

                val sessionId = System.currentTimeMillis()
                val withSession = filtered.map { it.copy(sessionId = sessionId) }

                AppDatabase.getDatabase(this@OcrProcessActivity)
                    .inventoryDao()
                    .insertAll(withSession)

                val intent = Intent(this@OcrProcessActivity, FilterActivity::class.java)
                intent.putExtra(FilterActivity.EXTRA_SESSION_ID, sessionId)
                startActivity(intent)
                finish()
            } catch (e: Exception) {
                showError("処理エラー: ${e.message}")
            }
        }
    }

    private fun showProgress(msg: String) {
        binding.progressBar.visibility = View.VISIBLE
        binding.tvStatus.text = msg
        binding.btnRetry.visibility = View.GONE
    }

    private fun showError(msg: String) {
        binding.progressBar.visibility = View.GONE
        binding.tvStatus.text = msg
        binding.btnRetry.visibility = View.VISIBLE
        binding.btnRetry.setOnClickListener { finish() }
    }
}
