package lvt.crm.ui.work

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import lvt.crm.R
import lvt.crm.data.work.WorkTaskItem

@Composable
fun WorkScreen(
    viewModel: WorkViewModel,
) {
    val state by viewModel.uiState.collectAsState()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 16.dp),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = 16.dp, bottom = 8.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(stringResource(R.string.nav_work), style = MaterialTheme.typography.headlineSmall)
            TextButton(onClick = { viewModel.refresh() }, enabled = !state.loading && !state.refreshing) {
                Text("Làm mới")
            }
        }

        when {
            state.loading -> {
                Column(
                    modifier = Modifier.fillMaxSize(),
                    verticalArrangement = Arrangement.Center,
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    CircularProgressIndicator()
                }
            }
            state.error != null -> {
                Column(
                    modifier = Modifier.fillMaxSize(),
                    verticalArrangement = Arrangement.Center,
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Text(state.error ?: "", color = MaterialTheme.colorScheme.error)
                    Spacer(modifier = Modifier.height(12.dp))
                    Button(onClick = { viewModel.refresh(initial = true) }) {
                        Text("Thử lại")
                    }
                }
            }
            state.tasks.isEmpty() -> {
                Text(
                    "Không có công việc nào.",
                    modifier = Modifier.padding(top = 24.dp),
                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
                )
            }
            else -> {
                if (state.actionError != null) {
                    Text(
                        state.actionError ?: "",
                        color = MaterialTheme.colorScheme.error,
                        modifier = Modifier.padding(bottom = 8.dp),
                    )
                }
                LazyColumn(
                    contentPadding = PaddingValues(bottom = 24.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    items(state.tasks, key = { "${it.kind}-${it.id}" }) { task ->
                        WorkCard(
                            task = task,
                            busy = state.busyTaskId == task.id,
                            onComplete = { viewModel.requestComplete(task) },
                        )
                    }
                }
            }
        }
    }

    val prompt = state.qualityPromptTask
    if (prompt != null) {
        AlertDialog(
            onDismissRequest = viewModel::dismissQualityPrompt,
            title = { Text("Nhập % chất lượng") },
            text = {
                Column {
                    Text("Admin tự hoàn thành cần nhập phần trăm chất lượng (0–100).")
                    Spacer(modifier = Modifier.height(12.dp))
                    OutlinedTextField(
                        value = state.qualityInput,
                        onValueChange = viewModel::onQualityInput,
                        label = { Text("% chất lượng") },
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
            },
            confirmButton = {
                TextButton(onClick = viewModel::confirmQualityComplete) {
                    Text("Hoàn thành")
                }
            },
            dismissButton = {
                TextButton(onClick = viewModel::dismissQualityPrompt) {
                    Text("Hủy")
                }
            },
        )
    }
}

@Composable
private fun WorkCard(
    task: WorkTaskItem,
    busy: Boolean,
    onComplete: () -> Unit,
) {
    val canComplete = task.status in setOf(
        "pending_task",
        "overdue",
        "rejected_completion",
        "pending",
        "rejected",
    )

    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.45f)),
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(task.title.ifBlank { "Công việc" }, style = MaterialTheme.typography.titleMedium)
            Spacer(modifier = Modifier.height(6.dp))
            if (task.documentContent.isNotBlank() && task.documentContent != task.title) {
                Text(
                    task.documentContent,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f),
                )
            }
            Text(
                "Hạn: ${task.deadline}" +
                    if (task.departmentName.isNotBlank()) " · ${task.departmentName}" else "",
                style = MaterialTheme.typography.bodySmall,
                modifier = Modifier.padding(top = 4.dp),
            )
            Text(
                "Trạng thái: ${workStatusLabel(task)}",
                style = MaterialTheme.typography.bodySmall,
                modifier = Modifier.padding(top = 6.dp),
            )
            if (task.rejectionReason.isNotBlank()) {
                Text(
                    "Lý do từ chối: ${task.rejectionReason}",
                    color = MaterialTheme.colorScheme.error,
                    style = MaterialTheme.typography.bodySmall,
                    modifier = Modifier.padding(top = 4.dp),
                )
            }
            if (canComplete) {
                Spacer(modifier = Modifier.height(12.dp))
                Button(onClick = onComplete, enabled = !busy) {
                    Text(if (task.isAdmin) "Hoàn thành (+%)" else "Báo hoàn thành")
                }
            }
        }
    }
}

private fun workStatusLabel(task: WorkTaskItem): String {
    val base = when (task.status) {
        "pending_task", "pending" -> "Chưa hoàn thành"
        "overdue" -> "Quá hạn"
        "pending_completion", "pending_approval" -> "Chờ duyệt hoàn thành"
        "completed", "approved", "done" -> "Đã hoàn thành"
        "completed_late" -> "Hoàn thành muộn"
        "rejected_completion", "rejected" -> "Bị từ chối"
        else -> task.status
    }
    return if (task.qualityPercent != null) "$base · ${task.qualityPercent}%" else base
}
