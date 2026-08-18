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
import lvt.crm.ui.components.ListSearchState

data class DutiesUiState(
    val loading: Boolean = true,
    val refreshing: Boolean = false,
    val error: String? = null,
    val actionError: String? = null,
    val attendanceConfirmationEnabled: Boolean = false,
    val duties: List<DutyItem> = emptyList(),
    val busyDutyId: String? = null,
    val currentUserId: String = "",
    val canCreate: Boolean = false,
    val isAdmin: Boolean = false,
    val canViewAll: Boolean = false,
    val mineTab: DutyListTab = DutyListTab.Upcoming,
    val createdTab: DutyListTab = DutyListTab.Upcoming,
    val search: ListSearchState = ListSearchState(),
) {
    val lists: SplitDutyLists
        get() = splitDutyLists(
            duties,
            currentUserId,
            includeManagedOthers = isAdmin || canViewAll,
            leftoverInMine = !isAdmin,
        )
    val tabMine: List<DutyItem>
        get() = filterDutiesByTab(lists.mine, mineTab)
    val tabCreated: List<DutyItem>
        get() = filterDutiesByTab(lists.created, createdTab)
    val visibleMine: List<DutyItem>
        get() = filterDutiesBySearch(tabMine, search)
    val visibleCreated: List<DutyItem>
        get() = filterDutiesBySearch(tabCreated, search)
    val showCreatedSection: Boolean
        get() = canCreate || lists.created.isNotEmpty()
    val mineSearchEmpty: Boolean
        get() = tabMine.isNotEmpty() && visibleMine.isEmpty()
    val createdSearchEmpty: Boolean
        get() = tabCreated.isNotEmpty() && visibleCreated.isEmpty()
}

class DutiesViewModel(
    private val repository: DutiesOperations,
    private val currentUserId: String = "",
) : ViewModel() {
    private val operationMutex = Mutex()
    private val refreshPending = AtomicBoolean(false)
    private val _uiState = MutableStateFlow(DutiesUiState(currentUserId = currentUserId))
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
                        canCreate = snap.canCreate,
                        isAdmin = snap.isAdmin,
                        canViewAll = snap.canViewAll,
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

    fun setMineTab(tab: DutyListTab) {
        _uiState.update { it.copy(mineTab = tab) }
    }

    fun setCreatedTab(tab: DutyListTab) {
        _uiState.update { it.copy(createdTab = tab) }
    }

    fun applyListTab(tab: DutyListTab) {
        _uiState.update { it.copy(mineTab = tab, createdTab = tab) }
    }

    fun updateSearch(search: ListSearchState) {
        _uiState.update { it.copy(search = search) }
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
                                canCreate = snap.canCreate,
                                isAdmin = snap.isAdmin,
                                canViewAll = snap.canViewAll,
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
        fun factory(
            repository: DutiesRepository,
            currentUserId: String,
        ): ViewModelProvider.Factory =
            object : ViewModelProvider.Factory {
                @Suppress("UNCHECKED_CAST")
                override fun <T : ViewModel> create(modelClass: Class<T>): T {
                    return DutiesViewModel(repository, currentUserId) as T
                }
            }
    }
}
