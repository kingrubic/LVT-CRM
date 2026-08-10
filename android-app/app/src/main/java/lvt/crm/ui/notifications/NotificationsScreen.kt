package lvt.crm.ui.notifications

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.outlined.AccessTime
import androidx.compose.material.icons.outlined.CheckCircleOutline
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.InsertDriveFile
import androidx.compose.material.icons.outlined.DeleteOutline
import androidx.compose.material.icons.outlined.Notifications
import androidx.compose.material.icons.outlined.NotificationsNone
import androidx.compose.material.icons.outlined.PictureAsPdf
import androidx.compose.material.icons.outlined.WarningAmber
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import lvt.crm.data.notifications.NotificationItem
import lvt.crm.ui.components.ScreenHeader
import lvt.crm.ui.components.StatePanel
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

@Composable
fun NotificationsScreen(
    viewModel: NotificationsViewModel,
    onOpenItem: (NotificationItem) -> Unit,
    tabOpenToken: Int,
) {
    val state by viewModel.uiState.collectAsState()
    var unreadOnly by rememberSaveable { mutableStateOf(false) }
    val visibleItems = visibleNotifications(state.items, unreadOnly)
    val listState = rememberLazyListState()

    LaunchedEffect(tabOpenToken) {
        if (visibleItems.isNotEmpty()) listState.scrollToItem(0)
    }

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
            refreshContainerColor = MaterialTheme.colorScheme.secondaryContainer,
            refreshContentColor = MaterialTheme.colorScheme.secondary,
            trailing = {
                if (state.unreadCount > 0) {
                    Box(
                        modifier = Modifier
                            .size(30.dp)
                            .clip(CircleShape)
                            .background(MaterialTheme.colorScheme.tertiary),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(
                            if (state.unreadCount > 99) "99+" else state.unreadCount.toString(),
                            color = MaterialTheme.colorScheme.onTertiary,
                            style = MaterialTheme.typography.labelLarge,
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
                        .padding(bottom = 14.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    FilterPill(
                        label = "${state.unreadCount} chưa đọc",
                        selected = unreadOnly,
                        accent = true,
                        onClick = { unreadOnly = !unreadOnly },
                    )
                    if (state.settings.milestonesHours.isNotEmpty()) {
                        Box(modifier = Modifier.weight(1f)) {
                            FilterPill(
                                label = milestoneSummary(state.settings.milestonesHours),
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
                            .padding(bottom = 14.dp),
                        horizontalArrangement = Arrangement.End,
                    ) {
                        Button(
                            onClick = viewModel::markAllRead,
                            enabled = state.busyKey == null,
                            shape = RoundedCornerShape(24.dp),
                            colors = ButtonDefaults.buttonColors(
                                containerColor = MaterialTheme.colorScheme.secondary,
                                contentColor = MaterialTheme.colorScheme.onSecondary,
                            ),
                        ) {
                            Icon(
                                Icons.Outlined.CheckCircleOutline,
                                contentDescription = null,
                                modifier = Modifier.size(20.dp),
                            )
                            Spacer(modifier = Modifier.width(8.dp))
                            Text("Đánh dấu tất cả đã đọc")
                        }
                    }
                }
                LazyColumn(
                    modifier = Modifier.weight(1f),
                    state = listState,
                    contentPadding = PaddingValues(bottom = 28.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    if (visibleItems.isEmpty()) {
                        item(key = "no-unread-notifications") {
                            StatePanel(
                                icon = Icons.Outlined.NotificationsNone,
                                title = "Không còn thông báo chưa đọc",
                                message = "Tất cả thông báo hiện tại đã được đọc.",
                            )
                        }
                    } else {
                        items(visibleItems, key = { it.key }) { item ->
                            NotificationCard(
                                item = item,
                                canDelete = state.canDelete,
                                busy = state.busyKey != null,
                                onOpen = { viewModel.open(item, onOpenItem) },
                                onDismiss = { viewModel.dismiss(item) },
                            )
                        }
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
    val (headline, fileName) = notificationHeadline(item)
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(enabled = !busy, onClick = onOpen),
        shape = RoundedCornerShape(18.dp),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surface,
        ),
        elevation = CardDefaults.cardElevation(
            defaultElevation = 2.dp,
        ),
    ) {
        Box {
            Box(
                modifier = Modifier
                    .matchParentSize(),
            ) {
                Box(
                    modifier = Modifier
                        .fillMaxHeight()
                        .width(5.dp)
                        .background(MaterialTheme.colorScheme.primary),
                )
            }
            Row(
                modifier = Modifier.padding(
                    start = 20.dp,
                    top = 16.dp,
                    end = if (item.read) 16.dp else 28.dp,
                    bottom = 16.dp,
                ),
                horizontalArrangement = Arrangement.spacedBy(13.dp),
                verticalAlignment = Alignment.Top,
            ) {
                Box(
                    modifier = Modifier
                        .size(48.dp)
                        .clip(CircleShape)
                        .background(MaterialTheme.colorScheme.primaryContainer),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(
                        Icons.Outlined.CheckCircleOutline,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.size(26.dp),
                    )
                }
                Column(modifier = Modifier.weight(1f)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
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
                            modifier = Modifier.weight(1f),
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                    Spacer(modifier = Modifier.height(6.dp))
                    Text(
                        headline,
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold,
                    )
                    if (fileName != null) {
                        Text(
                            fileName,
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.SemiBold,
                            maxLines = 2,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                    if (item.description.isNotBlank()) {
                        Text(
                            item.description,
                            style = MaterialTheme.typography.bodySmall,
                            modifier = Modifier.padding(top = 4.dp),
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            maxLines = 2,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                    Row(
                        modifier = Modifier.padding(top = 8.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Icon(
                            Icons.Outlined.AccessTime,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.size(17.dp),
                        )
                        Text(
                            "Hạn ${formatDueAt(item.dueAt)}",
                            style = MaterialTheme.typography.labelMedium,
                            color = MaterialTheme.colorScheme.primary,
                            modifier = Modifier.padding(start = 6.dp),
                        )
                    }
                }
                FileTypeTile(fileName = fileName)
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
            if (!item.read) {
                Box(
                    modifier = Modifier
                        .align(Alignment.TopEnd)
                        .padding(top = 14.dp, end = 14.dp)
                        .size(10.dp)
                        .clip(CircleShape)
                        .background(MaterialTheme.colorScheme.tertiary),
                )
            }
        }
    }
}

@Composable
private fun FilterPill(
    label: String,
    selected: Boolean = false,
    accent: Boolean = false,
    onClick: (() -> Unit)? = null,
) {
    val contentColor = if (accent) {
        MaterialTheme.colorScheme.primary
    } else {
        MaterialTheme.colorScheme.onSurfaceVariant
    }
    Text(
        label,
        style = MaterialTheme.typography.labelLarge,
        color = contentColor,
        modifier = Modifier
            .clip(CircleShape)
            .then(
                if (onClick != null) {
                    Modifier.clickable(onClick = onClick)
                } else {
                    Modifier
                },
            )
            .background(
                if (selected) {
                    MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.52f)
                } else {
                    MaterialTheme.colorScheme.surface.copy(alpha = 0.01f)
                },
            )
            .border(
                BorderStroke(
                    width = 1.dp,
                    color = if (accent) {
                        MaterialTheme.colorScheme.primary
                    } else {
                        MaterialTheme.colorScheme.outlineVariant
                    },
                ),
                CircleShape,
            )
            .padding(horizontal = 14.dp, vertical = 8.dp),
    )
}

internal fun visibleNotifications(
    items: List<NotificationItem>,
    unreadOnly: Boolean,
): List<NotificationItem> = if (unreadOnly) items.filterNot { it.read } else items

@Composable
private fun FileTypeTile(fileName: String?) {
    val extension = fileName
        ?.substringAfterLast('.', "")
        ?.uppercase()
        ?.takeIf { it.isNotBlank() }
    if (extension == null) return
    val isPdf = extension == "PDF"
    Column(
        modifier = Modifier
            .size(width = 72.dp, height = 94.dp)
            .clip(RoundedCornerShape(16.dp))
            .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.36f))
            .padding(12.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Icon(
            if (isPdf) Icons.Outlined.PictureAsPdf else Icons.AutoMirrored.Outlined.InsertDriveFile,
            contentDescription = extension,
            tint = if (isPdf) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary,
            modifier = Modifier.size(32.dp),
        )
        Text(
            extension,
            style = MaterialTheme.typography.labelMedium,
            color = if (isPdf) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary,
            modifier = Modifier.padding(top = 3.dp),
        )
    }
}

private fun kindLabel(item: NotificationItem): String = when {
    item.kind == "duty" -> "Công tác"
    item.sourceType == "completion_rejected" -> "Từ chối hoàn thành"
    item.sourceType == "approval" -> "Công văn cần duyệt"
    else -> "Công việc"
}

private fun notificationHeadline(item: NotificationItem): Pair<String, String?> {
    val title = item.title.ifBlank { kindLabel(item) }
    val marker = "Công văn cần duyệt:"
    return if (title.startsWith(marker)) {
        marker to title.removePrefix(marker).trim().takeIf { it.isNotBlank() }
    } else {
        title to null
    }
}

private fun milestoneSummary(hours: List<Int>): String =
    "Mốc ${hours.joinToString(" · ") { if (it == 0) "Đến hạn" else "${it}h" }}"

private fun formatDueAt(value: Long): String {
    if (value <= 0L) return "—"
    return SimpleDateFormat("dd/MM/yyyy HH:mm", Locale("vi", "VN")).apply {
        timeZone = TimeZone.getTimeZone("Asia/Ho_Chi_Minh")
    }.format(Date(value))
}
