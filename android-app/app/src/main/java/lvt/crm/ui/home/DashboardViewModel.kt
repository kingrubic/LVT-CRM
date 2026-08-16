package lvt.crm.ui.home

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import lvt.crm.data.duties.DutiesOperations
import lvt.crm.data.duties.DutiesRepository
import lvt.crm.data.work.WorkOperations
import lvt.crm.data.work.WorkRepository
import lvt.crm.data.work.needsCompletion

data class DashboardUiState(
    val loading: Boolean = true,
    val refreshing: Boolean = false,
    val error: Boolean = false,
    val upcomingDuties: Int = 0,
    val ongoingDuties: Int = 0,
    val pendingApproval: Int = 0,
    val pendingExecution: Int = 0,
)

class DashboardViewModel(
    private val dutiesRepository: DutiesOperations,
    private val workRepository: WorkOperations,
) : ViewModel() {
    private val _uiState = MutableStateFlow(DashboardUiState())
    val uiState: StateFlow<DashboardUiState> = _uiState.asStateFlow()

    init {
        refresh(initial = true)
    }

    fun refresh(initial: Boolean = false) {
        _uiState.update {
            it.copy(loading = initial, refreshing = !initial, error = false)
        }
        viewModelScope.launch {
            try {
                coroutineScope {
                    val duties = async { dutiesRepository.listMine() }
                    val work = async { workRepository.listMine() }
                    val dutiesSnapshot = duties.await()
                    val workSnapshot = work.await()
                    val pendingApproval = workSnapshot.completionReviews.size
                    val pendingExecution = workSnapshot.tasks.count { needsCompletion(it.status) }
                    _uiState.update {
                        it.copy(
                            loading = false,
                            refreshing = false,
                            error = false,
                            upcomingDuties = dutiesSnapshot.duties.count { duty -> duty.isUpcoming },
                            ongoingDuties = dutiesSnapshot.duties.count { duty -> duty.isOngoing },
                            pendingApproval = pendingApproval,
                            pendingExecution = pendingExecution,
                        )
                    }
                }
            } catch (_: Exception) {
                _uiState.update {
                    it.copy(loading = false, refreshing = false, error = true)
                }
            }
        }
    }

    companion object {
        fun factory(
            dutiesRepository: DutiesRepository,
            workRepository: WorkRepository,
        ): ViewModelProvider.Factory =
            object : ViewModelProvider.Factory {
                @Suppress("UNCHECKED_CAST")
                override fun <T : ViewModel> create(modelClass: Class<T>): T {
                    return DashboardViewModel(dutiesRepository, workRepository) as T
                }
            }
    }
}
