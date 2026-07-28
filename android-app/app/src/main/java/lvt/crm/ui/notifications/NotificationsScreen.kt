package lvt.crm.ui.notifications

import androidx.compose.foundation.clickable
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
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.DeleteOutline
import androidx.compose.material3.Badge
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import lvt.crm.R
import lvt.crm.data.notifications.NotificationItem
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

@Composable
fun NotificationsScreen(
    viewModel: NotificationsViewModel,
    onOpenItem: (NotificationItem) -> Unit,
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
            Row(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    stringResource(R.string.nav_notifications),
                    style = MaterialTheme.typography.headlineSmall,
                )
                if (state.unreadCount > 0) {
                    Badge {
                        Text(if (state.unreadCount > 99) "99+" else state.unreadCount.toString())
                    }
                }
            }
            TextButton(
                onClick = { viewModel.refresh() },
                enabled = !state.loading && !state.refreshing,
            ) {
                Text("Làm mới")
            }
        }

        if (!state.loading && state.settings.milestonesHours.isNotEmpty()) {
            Text(
                "Mốc nhắc: ${state.settings.milestonesHours.joinToString(" · ") { hours ->
                    if (hours == 0) "Đến hạn" else "$hours giờ"
                }}",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.65f),
                modifier = Modifier.padding(bottom = 8.dp),
            )
        }

        when {
            state.loading -> LoadingState()
            state.error != null -> ErrorState(
                message = state.error.orEmpty(),
                onRetry = { viewModel.refresh(initial = true) },
            )
            state.items.isEmpty() -> {
                Text(
                    "Hiện chưa có công tác hoặc công việc nào gần đến hạn.",
                    modifier = Modifier.padding(top = 24.dp),
                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.65f),
                )
            }
            else -> {
                if (state.actionError != null) {
                    Text(
                        state.actionError.orEmpty(),
                        color = MaterialTheme.colorScheme.error,
                        modifier = Modifier.padding(bottom = 8.dp),
                    )
                }
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.End,
                ) {
                    TextButton(
                        onClick = viewModel::markAllRead,
                        enabled = state.unreadCount > 0 &&
                            state.busyKey != NotificationsViewModel.BUSY_ALL,
                    ) {
                        Text("Đánh dấu tất cả đã đọc")
                    }
                }
                LazyColumn(
                    contentPadding = PaddingValues(bottom = 24.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    items(state.items, key = { it.key }) { item ->
                        NotificationCard(
                            item = item,
                            canDelete = state.canDelete,
                            busy = state.busyKey == item.key ||
                                state.busyKey == "dismiss:${item.key}",
                            onOpen = { viewModel.open(item, onOpenItem) },
                            onDismiss = { viewModel.dismiss(item) },
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun LoadingState() {
    Column(
        modifier = Modifier.fillMaxSize(),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        CircularProgressIndicator()
    }
}

@Composable
private fun ErrorState(
    message: String,
    onRetry: () -> Unit,
) {
    Column(
        modifier = Modifier.fillMaxSize(),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(message, color = MaterialTheme.colorScheme.error)
        Spacer(modifier = Modifier.height(12.dp))
        Button(onClick = onRetry) {
            Text("Thử lại")
        }
    }
}

@Composable
private fun NotificationCard(
    item: NotificationItem,
    canDelete: Boolean,
    busy: Boolean,
    onOpen: () -> Unit,
    onDismiss: () -> Unit,
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(enabled = !busy, onClick = onOpen),
        colors = CardDefaults.cardColors(
            containerColor = if (item.read) {
                MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.38f)
            } else {
                MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.72f)
            },
        ),
    ) {
        Row(
            modifier = Modifier.padding(16.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalAlignment = Alignment.Top,
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        "${kindLabel(item)} · ${item.milestoneLabel}",
                        style = MaterialTheme.typography.labelMedium,
                        color = if (item.sourceType == "completion_rejected") {
                            MaterialTheme.colorScheme.error
                        } else {
                            MaterialTheme.colorScheme.primary
                        },
                    )
                    if (!item.read) {
                        Text(
                            "CHƯA ĐỌC",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.primary,
                        )
                    }
                }
                Spacer(modifier = Modifier.height(6.dp))
                Text(
                    item.title.ifBlank { kindLabel(item) },
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                )
                if (item.description.isNotBlank()) {
                    Text(
                        item.description,
                        style = MaterialTheme.typography.bodySmall,
                        modifier = Modifier.padding(top = 4.dp),
                        color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.75f),
                    )
                }
                Text(
                    "Hạn ${formatDueAt(item.dueAt)}",
                    style = MaterialTheme.typography.bodySmall,
                    modifier = Modifier.padding(top = 6.dp),
                )
            }
            if (canDelete) {
                IconButton(
                    onClick = onDismiss,
                    enabled = !busy,
                ) {
                    Icon(
                        Icons.Outlined.DeleteOutline,
                        contentDescription = "Xóa thông báo",
                    )
                }
            }
        }
    }
}

private fun kindLabel(item: NotificationItem): String = when {
    item.kind == "duty" -> "Công tác"
    item.sourceType == "completion_rejected" -> "Từ chối hoàn thành"
    item.sourceType == "approval" -> "Công văn cần duyệt"
    else -> "Công việc"
}

private fun formatDueAt(value: Long): String {
    if (value <= 0L) return "—"
    return SimpleDateFormat("dd/MM/yyyy HH:mm", Locale("vi", "VN")).apply {
        timeZone = TimeZone.getTimeZone("Asia/Ho_Chi_Minh")
    }.format(Date(value))
}
