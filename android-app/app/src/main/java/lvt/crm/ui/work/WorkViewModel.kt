package lvt.crm.ui.work

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
import lvt.crm.data.work.WorkRepository
import lvt.crm.data.work.WorkTaskItem

data class WorkUiState(
    val loading: Boolean = true,
    val refreshing: Boolean = false,
    val error: String? = null,
    val actionError: String? = null,
    val isAdmin: Boolean = false,
    val tasks: List<WorkTaskItem> = emptyList(),
    val busyTaskId: String? = null,
    val qualityPromptTask: WorkTaskItem? = null,
    val qualityInput: String = "100",
)

class WorkViewModel(
    private val repository: WorkRepository,
) : ViewModel() {
    private val _uiState = MutableStateFlow(WorkUiState())
    val uiState: StateFlow<WorkUiState> = _uiState.asStateFlow()

    init {
        refresh(initial = true)
    }

    fun refresh(initial: Boolean = false) {
        viewModelScope.launch {
            _uiState.update {
                it.copy(loading = initial, refreshing = !initial, error = null, actionError = null)
            }
            try {
                val snap = repository.listMine()
                _uiState.update {
                    it.copy(
                        loading = false,
                        refreshing = false,
                        isAdmin = snap.isAdmin,
                        tasks = snap.tasks,
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

    fun requestComplete(task: WorkTaskItem) {
        if (task.isAdmin) {
            _uiState.update {
                it.copy(qualityPromptTask = task, qualityInput = "100", actionError = null)
            }
        } else {
            complete(task, qualityPercent = null)
        }
    }

    fun onQualityInput(value: String) {
        _uiState.update { it.copy(qualityInput = value.filter { ch -> ch.isDigit() }.take(3)) }
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
        _uiState.update { it.copy(qualityPromptTask = null) }
        complete(task, qualityPercent = pct)
    }

    private fun complete(task: WorkTaskItem, qualityPercent: Int?) {
        viewModelScope.launch {
            _uiState.update { it.copy(busyTaskId = task.id, actionError = null) }
            try {
                repository.complete(task, qualityPercent)
                val snap = repository.listMine()
                _uiState.update {
                    it.copy(
                        busyTaskId = null,
                        isAdmin = snap.isAdmin,
                        tasks = snap.tasks,
                    )
                }
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(
                        busyTaskId = null,
                        actionError = (e as? ConvexException)?.message
                            ?: ConvexHttpClient.humanize(e.message ?: "COMPLETE_FAILED"),
                    )
                }
            }
        }
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
