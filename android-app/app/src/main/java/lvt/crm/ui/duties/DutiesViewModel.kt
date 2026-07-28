package lvt.crm.ui.duties

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
import lvt.crm.data.duties.DutiesRepository
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
    private val repository: DutiesRepository,
) : ViewModel() {
    private val _uiState = MutableStateFlow(DutiesUiState())
    val uiState: StateFlow<DutiesUiState> = _uiState.asStateFlow()

    init {
        refresh(initial = true)
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
            }
        }
    }

    fun setAttendance(dutyId: String, status: String) {
        viewModelScope.launch {
            _uiState.update { it.copy(busyDutyId = dutyId, actionError = null) }
            try {
                repository.setAttendance(dutyId, status)
                val snap = repository.listMine()
                _uiState.update {
                    it.copy(
                        busyDutyId = null,
                        attendanceConfirmationEnabled = snap.attendanceConfirmationEnabled,
                        duties = snap.duties,
                    )
                }
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(
                        busyDutyId = null,
                        actionError = (e as? ConvexException)?.message
                            ?: ConvexHttpClient.humanize(e.message ?: "ATTENDANCE_FAILED"),
                    )
                }
            }
        }
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
