package com.example.photoinventory.data

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "inventory_items")
data class InventoryItem(
    @PrimaryKey(autoGenerate = true)
    val id: Long = 0,
    val nai: String = "",       // 内
    val hinban: String = "",    // 品番
    val noki: String = "",      // 納期
    val nyusaki: String = "",   // 納入先
    val sessionId: Long = 0,
    val timestamp: Long = System.currentTimeMillis()
)
