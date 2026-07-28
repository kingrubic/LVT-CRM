package lvt.crm.ui.notifications

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.DeleteOutline
import androidx.compose.material.icons.outlined.EventAvailable
import androidx.compose.material.icons.outlined.Notifications
import androidx.compose.material.icons.outlined.NotificationsNone
import androidx.compose.material.icons.outlined.TaskAlt
import androidx.compose.material.icons.outlined.WarningAmber
import androidx.compose.material3.Badge
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import lvt.crm.data.notifications.NotificationItem
import lvt.crm.ui.components.ScreenHeader
import lvt.crm.ui.components.StatePanel
import lvt.crm.ui.components.StatusPill
import lvt.crm.ui.components.StatusTone
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
            .padding(horizontal = 18.dp),
    ) {
        ScreenHeader(
            title = "Thông báo",
            subtitle = "Những việc cần chú ý sắp tới",
            icon = Icons.Outlined.Notifications,
            refreshing = state.refreshing,
            onRefresh = { viewModel.refresh() },
            trailing = {
                if (state.unreadCount > 0) {
                    Badge {
                        Text(
                            if (state.unreadCount > 99) {
                                "99+"
                            } else {
                                state.unreadCount.toString()
                            },
                        )
                    }
                }
            },
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
                        "Đang đồng bộ thông báo…",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(top = 14.dp),
                    )
                }
            }
            state.error != null -> {
                StatePanel(
                    icon = Icons.Outlined.WarningAmber,
                    title = "Chưa tải được thông báo",
                    message = state.error.orEmpty(),
                    action = {
                        Button(onClick = { viewModel.refresh(initial = true) }) {
                            Text("Thử lại")
                        }
                    },
                )
            }
            state.items.isEmpty() -> {
                StatePanel(
                    icon = Icons.Outlined.NotificationsNone,
                    title = "Mọi việc đang ổn",
                    message = "Chưa có công tác hoặc công việc nào gần đến hạn.",
                )
            }
            else -> {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(bottom = 12.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    StatusPill(
                        label = "${state.unreadCount} chưa đọc",
                        tone = if (state.unreadCount > 0) {
                            StatusTone.Warning
                        } else {
                            StatusTone.Positive
                        },
                    )
                    if (state.settings.milestonesHours.isNotEmpty()) {
                        Box(modifier = Modifier.weight(1f)) {
                            StatusPill(
                                label = milestoneSummary(state.settings.milestonesHours),
                                tone = StatusTone.Neutral,
                            )
                        }
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
                if (state.unreadCount > 0) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(bottom = 10.dp),
                        horizontalArrangement = Arrangement.End,
                    ) {
                        FilledTonalButton(
                            onClick = viewModel::markAllRead,
                            enabled = state.busyKey != NotificationsViewModel.BUSY_ALL,
                        ) {
                            Text("Đánh dấu tất cả đã đọc")
                        }
                    }
                }
                LazyColumn(
                    modifier = Modifier.weight(1f),
                    contentPadding = PaddingValues(bottom = 28.dp),
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
        shape = MaterialTheme.shapes.medium,
        colors = CardDefaults.cardColors(
            containerColor = when {
                item.sourceType == "completion_rejected" ->
                    MaterialTheme.colorScheme.errorContainer.copy(alpha = 0.52f)
                item.read -> MaterialTheme.colorScheme.surface
                else -> MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.54f)
            },
        ),
        elevation = CardDefaults.cardElevation(
            defaultElevation = if (item.read) 1.dp else 3.dp,
        ),
    ) {
        Row(
            modifier = Modifier.padding(16.dp),
            horizontalArrangement = Arrangement.spacedBy(13.dp),
            verticalAlignment = Alignment.Top,
        ) {
            Box(
                modifier = Modifier
                    .size(44.dp)
                    .clip(CircleShape)
                    .background(
                        if (item.sourceType == "completion_rejected") {
                            MaterialTheme.colorScheme.errorContainer
                        } else {
                            MaterialTheme.colorScheme.primaryContainer
                        },
                    ),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    notificationIcon(item),
                    contentDescription = null,
                    tint = if (item.sourceType == "completion_rejected") {
                        MaterialTheme.colorScheme.error
                    } else {
                        MaterialTheme.colorScheme.primary
                    },
                )
            }
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
                        Box(
                            modifier = Modifier
                                .size(8.dp)
                                .clip(CircleShape)
                                .background(MaterialTheme.colorScheme.tertiary),
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
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                Text(
                    "Hạn ${formatDueAt(item.dueAt)}",
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(top = 8.dp),
                )
            }
            if (canDelete) {
                IconButton(
                    onClick = onDismiss,
                    enabled = !busy,
                    modifier = Modifier.size(36.dp),
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

private fun notificationIcon(item: NotificationItem): ImageVector =
    if (item.kind == "duty") Icons.Outlined.EventAvailable else Icons.Outlined.TaskAlt

private fun kindLabel(item: NotificationItem): String = when {
    item.kind == "duty" -> "Công tác"
    item.sourceType == "completion_rejected" -> "Từ chối hoàn thành"
    item.sourceType == "approval" -> "Công văn cần duyệt"
    else -> "Công việc"
}

private fun milestoneSummary(hours: List<Int>): String =
    "Mốc ${hours.joinToString(" · ") { if (it == 0) "Đến hạn" else "${it}h" }}"

private fun formatDueAt(value: Long): String {
    if (value <= 0L) return "—"
    return SimpleDateFormat("dd/MM/yyyy HH:mm", Locale("vi", "VN")).apply {
        timeZone = TimeZone.getTimeZone("Asia/Ho_Chi_Minh")
    }.format(Date(value))
}
