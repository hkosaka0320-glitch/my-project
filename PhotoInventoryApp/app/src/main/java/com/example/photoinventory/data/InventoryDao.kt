package com.example.photoinventory.data

import androidx.room.*
import kotlinx.coroutines.flow.Flow

@Dao
interface InventoryDao {

    @Insert
    suspend fun insertAll(items: List<InventoryItem>): List<Long>

    @Query("SELECT * FROM inventory_items WHERE sessionId = :sessionId ORDER BY id ASC")
    suspend fun getItemsBySession(sessionId: Long): List<InventoryItem>

    @Query("SELECT DISTINCT sessionId, timestamp FROM inventory_items ORDER BY timestamp DESC")
    suspend fun getAllSessions(): List<SessionInfo>

    @Query("DELETE FROM inventory_items WHERE sessionId = :sessionId")
    suspend fun deleteSession(sessionId: Long)

    @Query("SELECT COUNT(*) FROM inventory_items WHERE sessionId = :sessionId")
    suspend fun countBySession(sessionId: Long): Int
}

data class SessionInfo(
    val sessionId: Long,
    val timestamp: Long
)
