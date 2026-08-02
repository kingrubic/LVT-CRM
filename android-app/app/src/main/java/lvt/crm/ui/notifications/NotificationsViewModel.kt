package lvt.crm.ui.notifications

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import lvt.crm.data.convex.ConvexException
import lvt.crm.data.convex.ConvexHttpClient
import lvt.crm.data.notifications.NotificationItem
import lvt.crm.data.notifications.NotificationSettings
import lvt.crm.data.notifications.NotificationsRepository
import lvt.crm.push.PushEvents

data class NotificationsUiState(
    val loading: Boolean = true,
    val refreshing: Boolean = false,
    val error: String? = null,
    val actionError: String? = null,
    val items: List<NotificationItem> = emptyList(),
    val unreadCount: Int = 0,
    val canDelete: Boolean = false,
    val settings: NotificationSettings = NotificationSettings(
        dutiesEnabled = true,
        workEnabled = true,
        milestonesHours = emptyList(),
    ),
    val busyKey: String? = null,
)

class NotificationsViewModel(
    private val repository: NotificationsRepository,
) : ViewModel() {
    private val _uiState = MutableStateFlow(NotificationsUiState())
    val uiState: StateFlow<NotificationsUiState> = _uiState.asStateFlow()

    init {
        refresh(initial = true)
        viewModelScope.launch {
            PushEvents.received.collect {
                refresh()
            }
        }
    }

    fun refresh(initial: Boolean = false) {
        viewModelScope.launch {
            _uiState.update {
                it.copy(
                    loading = initial,
                    refreshing = !initial,
                    error = null,
                    actionError = null,
                )
            }
            loadSnapshot()
        }
    }

    fun open(item: NotificationItem, onOpened: (NotificationItem) -> Unit) {
        viewModelScope.launch {
            _uiState.update { it.copy(busyKey = item.key, actionError = null) }
            try {
                if (!item.read) repository.markRead(item.key)
                onOpened(item)
                loadSnapshot(keepBusy = true)
            } catch (error: Exception) {
                showActionError(error)
            } finally {
                _uiState.update { it.copy(busyKey = null) }
            }
        }
    }

    fun markAllRead() {
        val keys = _uiState.value.items.filter { !it.read }.map { it.key }
        if (keys.isEmpty()) return
        viewModelScope.launch {
            _uiState.update { it.copy(busyKey = BUSY_ALL, actionError = null) }
            try {
                repository.markAllRead(keys)
                loadSnapshot(keepBusy = true)
            } catch (error: Exception) {
                showActionError(error)
            } finally {
                _uiState.update { it.copy(busyKey = null) }
            }
        }
    }

    fun dismiss(item: NotificationItem) {
        viewModelScope.launch {
            _uiState.update { it.copy(busyKey = "dismiss:${item.key}", actionError = null) }
            try {
                repository.dismiss(item.key)
                loadSnapshot(keepBusy = true)
            } catch (error: Exception) {
                showActionError(error)
            } finally {
                _uiState.update { it.copy(busyKey = null) }
            }
        }
    }

    private suspend fun loadSnapshot(keepBusy: Boolean = false) {
        try {
            val snapshot = repository.feed()
            _uiState.update {
                it.copy(
                    loading = false,
                    refreshing = false,
                    error = null,
                    items = snapshot.items,
                    unreadCount = snapshot.unreadCount,
                    canDelete = snapshot.canDelete,
                    settings = snapshot.settings,
                    busyKey = if (keepBusy) it.busyKey else null,
                )
            }
        } catch (error: Exception) {
            _uiState.update {
                it.copy(
                    loading = false,
                    refreshing = false,
                    error = humanize(error),
                    busyKey = if (keepBusy) it.busyKey else null,
                )
            }
        }
    }

    private fun showActionError(error: Exception) {
        _uiState.update { it.copy(actionError = humanize(error)) }
    }

    private fun humanize(error: Exception): String =
        (error as? ConvexException)?.message
            ?: ConvexHttpClient.humanize(error.message ?: "NOTIFICATION_FAILED")

    companion object {
        const val BUSY_ALL = "all"

        fun factory(repository: NotificationsRepository): ViewModelProvider.Factory =
            object : ViewModelProvider.Factory {
                @Suppress("UNCHECKED_CAST")
                override fun <T : ViewModel> create(modelClass: Class<T>): T {
                    return NotificationsViewModel(repository) as T
                }
            }
    }
}
