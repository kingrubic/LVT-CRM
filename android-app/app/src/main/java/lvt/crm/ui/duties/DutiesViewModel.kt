package lvt.crm.ui.duties

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import java.util.concurrent.atomic.AtomicBoolean
import lvt.crm.data.convex.ConvexException
import lvt.crm.data.convex.ConvexHttpClient
import lvt.crm.data.duties.DutiesRepository
import lvt.crm.data.duties.DutiesOperations
import lvt.crm.data.duties.DutyItem

data class DutiesUiState(
    val loading: Boolean = true,
    val refreshing: Boolean = false,
    val error: String? = null,
    val actionError: String? = null,
    val attendanceConfirmationEnabled: Boolean = false,
    val duties: List<DutyItem> = emptyList(),
    val busyDutyId: String? = null,
)

class DutiesViewModel(
    private val repository: DutiesOperations,
) : ViewModel() {
    private val operationMutex = Mutex()
    private val refreshPending = AtomicBoolean(false)
    private val _uiState = MutableStateFlow(DutiesUiState())
    val uiState: StateFlow<DutiesUiState> = _uiState.asStateFlow()

    init {
        refresh(initial = true)
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
                val snap = repository.listMine()
                _uiState.update {
                    it.copy(
                        loading = false,
                        refreshing = false,
                        attendanceConfirmationEnabled = snap.attendanceConfirmationEnabled,
                        duties = snap.duties,
                    )
                }
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(
                        loading = false,
                        refreshing = false,
                        error = (e as? ConvexException)?.message
                            ?: ConvexHttpClient.humanize(e.message ?: "LOAD_FAILED"),
                    )
                }
            } finally {
                releaseOperation()
            }
        }
    }

    fun setAttendance(dutyId: String, status: String) {
        _uiState.update { it.copy(busyDutyId = dutyId, actionError = null) }
        viewModelScope.launch {
            operationMutex.withLock {
                try {
                    repository.setAttendance(dutyId, status)
                    _uiState.update { state ->
                        state.copy(
                            duties = state.duties.map { duty ->
                                if (duty.id == dutyId) {
                                    duty.copy(myStatus = status, canMarkAttendance = false)
                                } else {
                                    duty
                                }
                            },
                        )
                    }
                    try {
                        val snap = repository.listMine()
                        _uiState.update {
                            it.copy(
                                attendanceConfirmationEnabled = snap.attendanceConfirmationEnabled,
                                duties = snap.duties,
                            )
                        }
                    } catch (_: Exception) {
                        _uiState.update {
                            it.copy(
                                actionError = "Đã lưu xác nhận, nhưng chưa tải lại được danh sách. Hãy làm mới.",
                            )
                        }
                    }
                } catch (e: Exception) {
                    _uiState.update {
                        it.copy(
                            actionError = (e as? ConvexException)?.message
                                ?: ConvexHttpClient.humanize(e.message ?: "ATTENDANCE_FAILED"),
                        )
                    }
                } finally {
                    if (_uiState.value.busyDutyId == dutyId) {
                        _uiState.update { it.copy(busyDutyId = null) }
                    }
                }
            }
            runPendingRefresh()
        }
    }

    private fun releaseOperation() {
        operationMutex.unlock()
        runPendingRefresh()
    }

    private fun runPendingRefresh() {
        if (refreshPending.getAndSet(false)) refresh()
    }

    companion object {
        fun factory(repository: DutiesRepository): ViewModelProvider.Factory =
            object : ViewModelProvider.Factory {
                @Suppress("UNCHECKED_CAST")
                override fun <T : ViewModel> create(modelClass: Class<T>): T {
                    return DutiesViewModel(repository) as T
                }
            }
    }
}
