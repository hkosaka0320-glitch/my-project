package com.example.photoinventory.adapter

import android.view.LayoutInflater
import android.view.ViewGroup
import androidx.recyclerview.widget.RecyclerView
import com.example.photoinventory.data.InventoryItem
import com.example.photoinventory.databinding.ItemInventoryBinding

class InventoryAdapter : RecyclerView.Adapter<InventoryAdapter.VH>() {

    private val items = mutableListOf<InventoryItem>()

    class VH(val binding: ItemInventoryBinding) : RecyclerView.ViewHolder(binding.root)

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): VH {
        val b = ItemInventoryBinding.inflate(LayoutInflater.from(parent.context), parent, false)
        return VH(b)
    }

    override fun getItemCount() = items.size

    override fun onBindViewHolder(holder: VH, position: Int) {
        val item = items[position]
        with(holder.binding) {
            tvHinban.text  = "品番: ${item.hinban}"
            tvNoki.text    = "納期: ${item.noki}"
            tvNyusaki.text = "納入先: ${item.nyusaki}"
            tvNai.text     = "内: ${item.nai}"
        }
    }

    fun setItems(list: List<InventoryItem>) {
        items.clear()
        items.addAll(list)
        notifyDataSetChanged()
    }
}
