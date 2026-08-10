package lvt.crm.ui.notifications

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import java.util.concurrent.atomic.AtomicBoolean
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
    private val operationMutex = Mutex()
    private val refreshPending = AtomicBoolean(false)
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
        if (!operationMutex.tryLock()) {
            refreshPending.set(true)
            return
        }
        _uiState.update {
            it.copy(
                loading = initial,
                refreshing = !initial,
                error = null,
                actionError = null,
            )
        }
        viewModelScope.launch {
            try {
                loadSnapshot()
            } finally {
                releaseOperation()
            }
        }
    }

    fun open(item: NotificationItem, onOpened: (NotificationItem) -> Unit) {
        onOpened(item)
        if (item.read || !operationMutex.tryLock()) return
        _uiState.update { it.copy(busyKey = item.key, actionError = null) }
        viewModelScope.launch {
            try {
                repository.markRead(item.key)
                _uiState.update { state ->
                    state.copy(
                        items = state.items.map { current ->
                            if (current.key == item.key) current.copy(read = true) else current
                        },
                        unreadCount = (state.unreadCount - 1).coerceAtLeast(0),
                    )
                }
                loadSnapshot(keepBusy = true)
            } catch (error: Exception) {
                showActionError(error)
            } finally {
                if (_uiState.value.busyKey == item.key) _uiState.update { it.copy(busyKey = null) }
                releaseOperation()
            }
        }
    }

    fun markAllRead() {
        val keys = _uiState.value.items.filter { !it.read }.map { it.key }
        if (keys.isEmpty()) return
        if (!operationMutex.tryLock()) return
        _uiState.update { it.copy(busyKey = BUSY_ALL, actionError = null) }
        viewModelScope.launch {
            try {
                repository.markAllRead(keys)
                _uiState.update { state ->
                    state.copy(items = state.items.map { it.copy(read = true) }, unreadCount = 0)
                }
                loadSnapshot(keepBusy = true)
            } catch (error: Exception) {
                showActionError(error)
            } finally {
                if (_uiState.value.busyKey == BUSY_ALL) _uiState.update { it.copy(busyKey = null) }
                releaseOperation()
            }
        }
    }

    fun dismiss(item: NotificationItem) {
        val operationKey = "dismiss:${item.key}"
        if (!operationMutex.tryLock()) return
        _uiState.update { it.copy(busyKey = operationKey, actionError = null) }
        viewModelScope.launch {
            try {
                repository.dismiss(item.key)
                _uiState.update { state ->
                    state.copy(
                        items = state.items.filterNot { it.key == item.key },
                        unreadCount = if (item.read) state.unreadCount else {
                            (state.unreadCount - 1).coerceAtLeast(0)
                        },
                    )
                }
                loadSnapshot(keepBusy = true)
            } catch (error: Exception) {
                showActionError(error)
            } finally {
                if (_uiState.value.busyKey == operationKey) _uiState.update { it.copy(busyKey = null) }
                releaseOperation()
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
                if (keepBusy) {
                    it.copy(
                        loading = false,
                        refreshing = false,
                        actionError = "Thao tác đã được lưu, nhưng chưa tải lại được thông báo. Hãy làm mới.",
                    )
                } else {
                    it.copy(
                        loading = false,
                        refreshing = false,
                        error = humanize(error),
                        busyKey = null,
                    )
                }
            }
        }
    }

    private fun showActionError(error: Exception) {
        _uiState.update { it.copy(actionError = humanize(error)) }
    }

    private fun humanize(error: Exception): String =
        (error as? ConvexException)?.message
            ?: ConvexHttpClient.humanize(error.message ?: "NOTIFICATION_FAILED")

    private fun releaseOperation() {
        operationMutex.unlock()
        if (refreshPending.getAndSet(false)) refresh()
    }

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
