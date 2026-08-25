package lvt.crm.ui.work

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
import lvt.crm.data.work.WorkRepository
import lvt.crm.data.work.WorkOperations
import lvt.crm.data.work.WorkApprovalItem
import lvt.crm.data.work.WorkCompletionReviewItem
import lvt.crm.data.work.WorkTaskItem
import lvt.crm.ui.components.ListSearchState

data class WorkUiState(
    val loading: Boolean = true,
    val refreshing: Boolean = false,
    val error: String? = null,
    val actionError: String? = null,
    val isAdmin: Boolean = false,
    val accessLevel: Int = 0,
    val tasks: List<WorkTaskItem> = emptyList(),
    val approvals: List<WorkApprovalItem> = emptyList(),
    val busyTaskId: String? = null,
    val busyApprovalId: String? = null,
    val busyReviewId: String? = null,
    val qualityPromptTask: WorkTaskItem? = null,
    val qualityInput: String = "100",
    val evidencePromptTask: WorkTaskItem? = null,
    val evidenceNote: String = "",
    val completionReviews: List<WorkCompletionReviewItem> = emptyList(),
    val mineTab: WorkListTab = WorkListTab.Incomplete,
    val createdTab: WorkListTab = WorkListTab.Incomplete,
    val needsExecutionOnly: Boolean = false,
    val search: ListSearchState = ListSearchState(),
) {
    val tabMine: List<WorkTaskItem>
        get() = if (needsExecutionOnly) {
            filterTasksNeedingExecution(tasks)
        } else {
            filterTasksByTab(tasks, mineTab)
        }
    val tabCreated: List<WorkApprovalItem>
        get() = filterDocumentsByTab(approvals, createdTab)
    val visibleMine: List<WorkTaskItem>
        get() = filterTasksBySearch(tabMine, search)
    val visibleCreated: List<WorkApprovalItem>
        get() = filterDocumentsBySearch(tabCreated, search)
    val mineSearchEmpty: Boolean
        get() = tabMine.isNotEmpty() && visibleMine.isEmpty()
    val createdSearchEmpty: Boolean
        get() = tabCreated.isNotEmpty() && visibleCreated.isEmpty()
    val incompleteMineCount: Int
        get() = if (needsExecutionOnly) {
            filterTasksNeedingExecution(tasks).size
        } else {
            filterTasksByTab(tasks, WorkListTab.Incomplete).size
        }
    val incompleteCreatedCount: Int
        get() = filterDocumentsByTab(approvals, WorkListTab.Incomplete).size
}

class WorkViewModel(
    private val repository: WorkOperations,
) : ViewModel() {
    private val operationMutex = Mutex()
    private val refreshPending = AtomicBoolean(false)
    private val _uiState = MutableStateFlow(WorkUiState())
    val uiState: StateFlow<WorkUiState> = _uiState.asStateFlow()

    init {
        refresh(initial = true)
    }

    fun refresh(initial: Boolean = false) {
        if (!operationMutex.tryLock()) {
            refreshPending.set(true)
            return
        }
        _uiState.update {
            it.copy(loading = initial, refreshing = !initial, error = null, actionError = null)
        }
        viewModelScope.launch {
            try {
                val snap = repository.listMine()
                _uiState.update {
                    it.copy(
                        loading = false,
                        refreshing = false,
                        isAdmin = snap.isAdmin,
                        accessLevel = snap.accessLevel,
                        tasks = snap.tasks,
                        approvals = snap.approvals,
                        completionReviews = snap.completionReviews,
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

    fun setMineTab(tab: WorkListTab) {
        _uiState.update { it.copy(mineTab = tab, needsExecutionOnly = false) }
    }

    fun setCreatedTab(tab: WorkListTab) {
        _uiState.update { it.copy(createdTab = tab) }
    }

    fun updateSearch(search: ListSearchState) {
        _uiState.update { it.copy(search = search) }
    }

    fun applyDashboardFilter(filter: WorkDashboardFilter) {
        _uiState.update { state ->
            when (filter) {
                WorkDashboardFilter.PendingApproval -> state.copy(
                    mineTab = WorkListTab.Incomplete,
                    createdTab = WorkListTab.Incomplete,
                    needsExecutionOnly = false,
                )
                WorkDashboardFilter.NeedsExecution -> state.copy(
                    mineTab = WorkListTab.Incomplete,
                    needsExecutionOnly = true,
                )
            }
        }
    }

    fun requestComplete(task: WorkTaskItem) {
        if (task.isAdmin) {
            _uiState.update {
                it.copy(qualityPromptTask = task, qualityInput = "100", actionError = null)
            }
        } else {
            _uiState.update {
                it.copy(evidencePromptTask = task, evidenceNote = "", actionError = null)
            }
        }
    }

    fun dismissEvidencePrompt() {
        _uiState.update { it.copy(evidencePromptTask = null, evidenceNote = "") }
    }

    fun onEvidenceNoteChange(value: String) {
        _uiState.update { it.copy(evidenceNote = value.take(500)) }
    }

    fun setActionError(error: String) {
        _uiState.update { it.copy(actionError = error) }
    }

    fun completeWithEvidence(
        task: WorkTaskItem,
        fileBytes: ByteArray,
        fileName: String,
        mimeType: String,
    ) {
        complete(task, qualityPercent = null, fileBytes = fileBytes, fileName = fileName, mimeType = mimeType)
    }

    fun decideApproval(approval: WorkApprovalItem, approve: Boolean) {
        _uiState.update { it.copy(busyApprovalId = approval.id, actionError = null) }
        viewModelScope.launch {
            operationMutex.withLock {
                try {
                    repository.decideApproval(approval.id, approve)
                    _uiState.update { state ->
                        state.copy(
                            approvals = state.approvals.map { item ->
                                if (item.id == approval.id) {
                                    item.copy(myDecision = if (approve) "approved" else "rejected")
                                } else {
                                    item
                                }
                            },
                        )
                    }
                    reloadAfterCommittedMutation()
                } catch (e: Exception) {
                    _uiState.update {
                        it.copy(
                            actionError = (e as? ConvexException)?.message
                                ?: ConvexHttpClient.humanize(e.message ?: "APPROVAL_FAILED"),
                        )
                    }
                } finally {
                    if (_uiState.value.busyApprovalId == approval.id) {
                        _uiState.update { it.copy(busyApprovalId = null) }
                    }
                }
            }
            runPendingRefresh()
        }
    }

    fun onQualityInput(value: String) {
        _uiState.update { it.copy(qualityInput = value.filter { ch -> ch.isDigit() }.take(3)) }
    }

    fun reviewCompletion(
        review: WorkCompletionReviewItem,
        approve: Boolean,
        qualityPercent: Int? = null,
        rejectionReason: String? = null,
    ) {
        val operationId = review.workItemId + review.userId
        _uiState.update { it.copy(busyReviewId = operationId, actionError = null) }
        viewModelScope.launch {
            operationMutex.withLock {
                try {
                    repository.reviewCompletion(review, approve, qualityPercent, rejectionReason)
                    _uiState.update { state ->
                        state.copy(
                            completionReviews = state.completionReviews.filterNot {
                                it.workItemId == review.workItemId && it.userId == review.userId
                            },
                        )
                    }
                    reloadAfterCommittedMutation()
                } catch (e: Exception) {
                    _uiState.update {
                        it.copy(
                            actionError = (e as? ConvexException)?.message
                                ?: ConvexHttpClient.humanize(e.message ?: "COMPLETION_REVIEW_FAILED"),
                        )
                    }
                } finally {
                    if (_uiState.value.busyReviewId == operationId) {
                        _uiState.update { it.copy(busyReviewId = null) }
                    }
                }
            }
            runPendingRefresh()
        }
    }

    fun dismissQualityPrompt() {
        _uiState.update { it.copy(qualityPromptTask = null) }
    }

    fun confirmQualityComplete() {
        val task = _uiState.value.qualityPromptTask ?: return
        val pct = _uiState.value.qualityInput.toIntOrNull()
        if (pct == null || pct < 0 || pct > 100) {
            _uiState.update { it.copy(actionError = "Nhập % chất lượng từ 0 đến 100.") }
            return
        }
        complete(task, qualityPercent = pct)
        _uiState.update { it.copy(qualityPromptTask = null) }
    }

    private fun complete(
        task: WorkTaskItem,
        qualityPercent: Int?,
        fileBytes: ByteArray? = null,
        fileName: String? = null,
        mimeType: String? = null,
    ) {
        val note = _uiState.value.evidenceNote.trim().ifBlank { null }
        _uiState.update { it.copy(busyTaskId = task.id, actionError = null, evidencePromptTask = null, evidenceNote = "") }
        viewModelScope.launch {
            operationMutex.withLock {
                try {
                    val evidence = if (fileBytes != null && fileName != null && mimeType != null) {
                        repository.uploadEvidence(fileBytes, fileName, mimeType)
                    } else null
                    repository.complete(task, qualityPercent, evidence, note)
                    _uiState.update { state ->
                        state.copy(
                            tasks = state.tasks.map { item ->
                                if (item.id == task.id && item.kind == task.kind) {
                                    item.copy(
                                        status = if (task.isAdmin) "completed" else "pending_completion",
                                        qualityPercent = qualityPercent ?: item.qualityPercent,
                                    )
                                } else {
                                    item
                                }
                            },
                        )
                    }
                    reloadAfterCommittedMutation()
                } catch (e: Exception) {
                    _uiState.update {
                        it.copy(
                            actionError = (e as? ConvexException)?.message
                                ?: ConvexHttpClient.humanize(e.message ?: "COMPLETE_FAILED"),
                        )
                    }
                } finally {
                    if (_uiState.value.busyTaskId == task.id) {
                        _uiState.update { it.copy(busyTaskId = null) }
                    }
                }
            }
            runPendingRefresh()
        }
    }

    private suspend fun reloadAfterCommittedMutation() {
        try {
            val snap = repository.listMine()
            _uiState.update {
                it.copy(
                    isAdmin = snap.isAdmin,
                    accessLevel = snap.accessLevel,
                    tasks = snap.tasks,
                    approvals = snap.approvals,
                    completionReviews = snap.completionReviews,
                )
            }
        } catch (_: Exception) {
            _uiState.update {
                it.copy(actionError = "Thao tác đã được lưu, nhưng chưa tải lại được danh sách. Hãy làm mới.")
            }
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
        fun factory(repository: WorkRepository): ViewModelProvider.Factory =
            object : ViewModelProvider.Factory {
                @Suppress("UNCHECKED_CAST")
                override fun <T : ViewModel> create(modelClass: Class<T>): T {
                    return WorkViewModel(repository) as T
                }
            }
    }
}
