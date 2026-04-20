package com.example.photoinventory.adapter

import android.view.LayoutInflater
import android.view.ViewGroup
import androidx.recyclerview.widget.RecyclerView
import com.example.photoinventory.databinding.ItemFilterOptionBinding

class FilterOptionAdapter : RecyclerView.Adapter<FilterOptionAdapter.VH>() {

    private val options = mutableListOf<String>()
    private val checked = mutableMapOf<String, Boolean>()

    class VH(val binding: ItemFilterOptionBinding) : RecyclerView.ViewHolder(binding.root)

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): VH {
        val b = ItemFilterOptionBinding.inflate(LayoutInflater.from(parent.context), parent, false)
        return VH(b)
    }

    override fun getItemCount() = options.size

    override fun onBindViewHolder(holder: VH, position: Int) {
        val option = options[position]
        // setOnCheckedChangeListenerをリセットしてから状態をセットする
        holder.binding.checkbox.setOnCheckedChangeListener(null)
        holder.binding.checkbox.text = option
        holder.binding.checkbox.isChecked = checked[option] ?: false
        holder.binding.checkbox.setOnCheckedChangeListener { _, isChecked ->
            checked[option] = isChecked
        }
    }

    fun setOptions(list: List<String>) {
        options.clear()
        options.addAll(list)
        checked.clear()
        notifyDataSetChanged()
    }

    fun getCheckedItems(): List<String> = options.filter { checked[it] == true }
}
