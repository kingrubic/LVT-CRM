package lvt.crm.ui.theme

import android.content.Context
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

enum class AppearanceMode {
    System,
    Light,
    Dark,
    ;

    val title: String
        get() = when (this) {
            System -> "Theo hệ thống"
            Light -> "Sáng"
            Dark -> "Tối"
        }
}

class AppearanceStore(context: Context) {
    private val prefs = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    private val _mode = MutableStateFlow(read())
    val mode: StateFlow<AppearanceMode> = _mode.asStateFlow()

    fun set(mode: AppearanceMode) {
        prefs.edit().putString(KEY, mode.name).apply()
        _mode.value = mode
    }

    private fun read(): AppearanceMode {
        val raw = prefs.getString(KEY, AppearanceMode.System.name).orEmpty()
        return AppearanceMode.entries.firstOrNull { it.name == raw } ?: AppearanceMode.System
    }

    companion object {
        private const val PREFS = "lvt_appearance"
        private const val KEY = "mode"
    }
}
