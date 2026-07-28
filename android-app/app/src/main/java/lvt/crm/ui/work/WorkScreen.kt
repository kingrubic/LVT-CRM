package lvt.crm.ui.work

import androidx.compose.foundation.border
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
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AssignmentLate
import androidx.compose.material.icons.outlined.Business
import androidx.compose.material.icons.outlined.CalendarMonth
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.Description
import androidx.compose.material.icons.outlined.TaskAlt
import androidx.compose.material.icons.outlined.WarningAmber
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import lvt.crm.data.work.WorkTaskItem
import lvt.crm.ui.components.ScreenHeader
import lvt.crm.ui.components.StatePanel
import lvt.crm.ui.components.StatusPill
import lvt.crm.ui.components.StatusTone

@Composable
fun WorkScreen(
    viewModel: WorkViewModel,
    focusId: String?,
) {
    val state by viewModel.uiState.collectAsState()
    val listState = rememberLazyListState()

    LaunchedEffect(focusId, state.tasks) {
        val index = state.tasks.indexOfFirst { it.id == focusId }
        if (index >= 0) listState.animateScrollToItem(index)
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 18.dp),
    ) {
        ScreenHeader(
            title = "Công việc",
            subtitle = "Theo dõi tiến độ và hoàn thành",
            icon = Icons.Outlined.TaskAlt,
            refreshing = state.refreshing,
            onRefresh = { viewModel.refresh() },
        )

        when {
            state.loading -> {
                Column(
                    modifier = Modifier.fillMaxSize(),
                    verticalArrangement = Arrangement.Center,
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    CircularProgressIndicator()
                    Text(
                        "Đang tải công việc…",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(top = 14.dp),
                    )
                }
            }
            state.error != null -> {
                StatePanel(
                    icon = Icons.Outlined.WarningAmber,
                    title = "Chưa tải được công việc",
                    message = state.error.orEmpty(),
                    action = {
                        Button(onClick = { viewModel.refresh(initial = true) }) {
                            Text("Thử lại")
                        }
                    },
                )
            }
            state.tasks.isEmpty() -> {
                StatePanel(
                    icon = Icons.Outlined.TaskAlt,
                    title = "Bạn đã hoàn tất",
                    message = "Hiện không có công việc nào cần xử lý.",
                )
            }
            else -> {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(bottom = 12.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    StatusPill(
                        label = "${state.tasks.size} công việc",
                        tone = StatusTone.Primary,
                    )
                    val urgent = state.tasks.count {
                        it.status in setOf("overdue", "rejected", "rejected_completion")
                    }
                    if (urgent > 0) {
                        StatusPill(
                            label = "$urgent cần chú ý",
                            tone = StatusTone.Warning,
                        )
                    }
                }
                state.actionError?.let {
                    Card(
                        colors = CardDefaults.cardColors(
                            containerColor = MaterialTheme.colorScheme.errorContainer,
                        ),
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(bottom = 10.dp),
                    ) {
                        Text(
                            it,
                            color = MaterialTheme.colorScheme.onErrorContainer,
                            style = MaterialTheme.typography.bodySmall,
                            modifier = Modifier.padding(12.dp),
                        )
                    }
                }
                LazyColumn(
                    modifier = Modifier.weight(1f),
                    state = listState,
                    contentPadding = PaddingValues(bottom = 28.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    items(state.tasks, key = { "${it.kind}-${it.id}" }) { task ->
                        WorkCard(
                            task = task,
                            focused = task.id == focusId,
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
            icon = {
                Icon(Icons.Outlined.TaskAlt, contentDescription = null)
            },
            title = { Text("Ghi nhận chất lượng") },
            text = {
                Column {
                    Text(
                        "Nhập tỷ lệ chất lượng hoàn thành cho công việc “${prompt.title}”.",
                        style = MaterialTheme.typography.bodyMedium,
                    )
                    Spacer(modifier = Modifier.height(14.dp))
                    OutlinedTextField(
                        value = state.qualityInput,
                        onValueChange = viewModel::onQualityInput,
                        label = { Text("% chất lượng") },
                        supportingText = { Text("Giá trị từ 0 đến 100") },
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        modifier = Modifier.fillMaxWidth(),
                        shape = MaterialTheme.shapes.medium,
                    )
                }
            },
            confirmButton = {
                Button(onClick = viewModel::confirmQualityComplete) {
                    Text("Xác nhận")
                }
            },
            dismissButton = {
                TextButton(onClick = viewModel::dismissQualityPrompt) {
                    Text("Hủy")
                }
            },
            shape = MaterialTheme.shapes.large,
        )
    }
}

@Composable
private fun WorkCard(
    task: WorkTaskItem,
    focused: Boolean,
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
    val cardModifier = if (focused) {
        Modifier
            .fillMaxWidth()
            .border(
                width = 2.dp,
                color = MaterialTheme.colorScheme.primary,
                shape = MaterialTheme.shapes.medium,
            )
    } else {
        Modifier.fillMaxWidth()
    }

    Card(
        modifier = cardModifier,
        shape = MaterialTheme.shapes.medium,
        colors = CardDefaults.cardColors(
            containerColor = if (task.status in setOf("rejected", "rejected_completion")) {
                MaterialTheme.colorScheme.errorContainer.copy(alpha = 0.42f)
            } else if (focused) {
                MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.48f)
            } else {
                MaterialTheme.colorScheme.surface
            },
        ),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
    ) {
        Column(modifier = Modifier.padding(17.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.Top,
            ) {
                Text(
                    task.title.ifBlank { "Công việc" },
                    style = MaterialTheme.typography.titleMedium,
                    modifier = Modifier.weight(1f),
                )
                StatusPill(
                    label = workStatusLabel(task),
                    tone = workStatusTone(task.status),
                )
            }
            if (task.documentContent.isNotBlank() && task.documentContent != task.title) {
                DetailLine(
                    icon = Icons.Outlined.Description,
                    text = task.documentContent,
                    modifier = Modifier.padding(top = 10.dp),
                )
            }
            DetailLine(
                icon = Icons.Outlined.CalendarMonth,
                text = "Hạn ${task.deadline}",
                modifier = Modifier.padding(top = 8.dp),
            )
            if (task.departmentName.isNotBlank()) {
                DetailLine(
                    icon = Icons.Outlined.Business,
                    text = task.departmentName,
                )
            }
            if (task.rejectionReason.isNotBlank()) {
                Card(
                    colors = CardDefaults.cardColors(
                        containerColor = MaterialTheme.colorScheme.errorContainer,
                    ),
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = 10.dp),
                ) {
                    Row(
                        modifier = Modifier.padding(12.dp),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        Icon(
                            Icons.Outlined.AssignmentLate,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.error,
                        )
                        Text(
                            task.rejectionReason,
                            color = MaterialTheme.colorScheme.onErrorContainer,
                            style = MaterialTheme.typography.bodySmall,
                            modifier = Modifier.weight(1f),
                        )
                    }
                }
            }
            if (canComplete) {
                Spacer(modifier = Modifier.height(14.dp))
                Button(
                    onClick = onComplete,
                    enabled = !busy,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Icon(Icons.Outlined.CheckCircle, contentDescription = null)
                    Text(
                        if (task.isAdmin) "Hoàn thành và chấm %" else "Báo hoàn thành",
                        modifier = Modifier.padding(start = 7.dp),
                    )
                }
            }
        }
    }
}

@Composable
private fun DetailLine(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    text: String,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier.padding(vertical = 3.dp),
        verticalAlignment = Alignment.Top,
        horizontalArrangement = Arrangement.spacedBy(9.dp),
    ) {
        Icon(
            icon,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.primary,
        )
        Text(
            text,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.weight(1f),
        )
    }
}

private fun workStatusLabel(task: WorkTaskItem): String {
    val base = when (task.status) {
        "pending_task", "pending" -> "Chưa hoàn thành"
        "overdue" -> "Quá hạn"
        "pending_completion", "pending_approval" -> "Chờ duyệt"
        "completed", "approved", "done" -> "Đã hoàn thành"
        "completed_late" -> "Hoàn thành muộn"
        "rejected_completion", "rejected" -> "Bị từ chối"
        else -> task.status
    }
    return if (task.qualityPercent != null) "$base · ${task.qualityPercent}%" else base
}

private fun workStatusTone(status: String): StatusTone = when (status) {
    "completed", "approved", "done" -> StatusTone.Positive
    "overdue", "rejected_completion", "rejected" -> StatusTone.Warning
    "pending_completion", "pending_approval" -> StatusTone.Primary
    else -> StatusTone.Neutral
}
