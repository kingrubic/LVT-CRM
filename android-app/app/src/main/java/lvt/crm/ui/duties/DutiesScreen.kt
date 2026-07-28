package lvt.crm.ui.duties

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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.CalendarMonth
import androidx.compose.material.icons.outlined.Cancel
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.EventAvailable
import androidx.compose.material.icons.outlined.EventBusy
import androidx.compose.material.icons.outlined.Groups
import androidx.compose.material.icons.outlined.LocationOn
import androidx.compose.material.icons.outlined.WarningAmber
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import lvt.crm.data.duties.DutyItem
import lvt.crm.ui.components.ScreenHeader
import lvt.crm.ui.components.StatePanel
import lvt.crm.ui.components.StatusPill
import lvt.crm.ui.components.StatusTone

@Composable
fun DutiesScreen(
    viewModel: DutiesViewModel,
    focusId: String?,
) {
    val state by viewModel.uiState.collectAsState()
    val listState = rememberLazyListState()

    LaunchedEffect(focusId, state.duties) {
        val index = state.duties.indexOfFirst { it.id == focusId }
        if (index >= 0) listState.animateScrollToItem(index)
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 18.dp),
    ) {
        ScreenHeader(
            title = "Công tác",
            subtitle = "Lịch và xác nhận tham gia",
            icon = Icons.Outlined.EventAvailable,
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
                        "Đang tải lịch công tác…",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(top = 14.dp),
                    )
                }
            }
            state.error != null -> {
                StatePanel(
                    icon = Icons.Outlined.WarningAmber,
                    title = "Chưa tải được công tác",
                    message = state.error.orEmpty(),
                    action = {
                        Button(onClick = { viewModel.refresh(initial = true) }) {
                            Text("Thử lại")
                        }
                    },
                )
            }
            state.duties.isEmpty() -> {
                StatePanel(
                    icon = Icons.Outlined.EventBusy,
                    title = "Lịch đang trống",
                    message = "Bạn chưa có công tác nào được phân công.",
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
                        label = "${state.duties.size} công tác",
                        tone = StatusTone.Primary,
                    )
                    val ongoing = state.duties.count { it.isOngoing }
                    if (ongoing > 0) {
                        StatusPill(
                            label = "$ongoing đang diễn ra",
                            tone = StatusTone.Positive,
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
                    items(state.duties, key = { it.id }) { duty ->
                        DutyCard(
                            duty = duty,
                            focused = duty.id == focusId,
                            confirmationEnabled = state.attendanceConfirmationEnabled,
                            busy = state.busyDutyId == duty.id,
                            onAttend = { viewModel.setAttendance(duty.id, "attended") },
                            onAbsent = { viewModel.setAttendance(duty.id, "absent") },
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun DutyCard(
    duty: DutyItem,
    focused: Boolean,
    confirmationEnabled: Boolean,
    busy: Boolean,
    onAttend: () -> Unit,
    onAbsent: () -> Unit,
) {
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
            containerColor = if (focused) {
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
                    duty.content.ifBlank { "Công tác" },
                    style = MaterialTheme.typography.titleMedium,
                    modifier = Modifier.weight(1f),
                )
                Spacer(modifier = Modifier.width(8.dp))
                StatusPill(
                    label = timingLabel(duty),
                    tone = timingTone(duty),
                )
            }
            Spacer(modifier = Modifier.height(12.dp))
            DetailLine(
                icon = Icons.Outlined.CalendarMonth,
                text = scheduleLabel(duty),
            )
            if (duty.locationNames.isNotEmpty()) {
                DetailLine(
                    icon = Icons.Outlined.LocationOn,
                    text = duty.locationNames.joinToString(", "),
                )
            }
            if (duty.departmentNames.isNotEmpty()) {
                DetailLine(
                    icon = Icons.Outlined.Groups,
                    text = duty.departmentNames.joinToString(", "),
                )
            }
            Spacer(modifier = Modifier.height(10.dp))
            StatusPill(
                label = statusLabel(duty.myStatus),
                tone = statusTone(duty.myStatus),
            )

            if (confirmationEnabled && duty.isMine && duty.canMarkAttendance) {
                Spacer(modifier = Modifier.height(15.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    Button(
                        onClick = onAttend,
                        enabled = !busy,
                        modifier = Modifier.weight(1f),
                    ) {
                        Icon(Icons.Outlined.CheckCircle, contentDescription = null)
                        Text("Có mặt", modifier = Modifier.padding(start = 6.dp))
                    }
                    FilledTonalButton(
                        onClick = onAbsent,
                        enabled = !busy,
                        modifier = Modifier.weight(1f),
                    ) {
                        Icon(Icons.Outlined.Cancel, contentDescription = null)
                        Text("Vắng", modifier = Modifier.padding(start = 6.dp))
                    }
                }
            }
        }
    }
}

@Composable
private fun DetailLine(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    text: String,
) {
    Row(
        modifier = Modifier.padding(vertical = 3.dp),
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

private fun scheduleLabel(duty: DutyItem): String {
    val date = if (duty.startDate == duty.endDate) {
        duty.startDate
    } else {
        "${duty.startDate} → ${duty.endDate}"
    }
    val time = if (duty.allDay) "Cả ngày" else "${duty.startTime}–${duty.endTime}"
    return "$date · $time"
}

private fun statusLabel(status: String): String = when (status) {
    "attended" -> "Đã xác nhận có mặt"
    "absent" -> "Đã báo vắng"
    "pending" -> "Chưa xác nhận"
    else -> status
}

private fun statusTone(status: String): StatusTone = when (status) {
    "attended" -> StatusTone.Positive
    "absent" -> StatusTone.Warning
    else -> StatusTone.Neutral
}

private fun timingLabel(duty: DutyItem): String = when {
    duty.isOngoing -> "Đang diễn ra"
    duty.isOverdue -> "Đã kết thúc"
    duty.isUpcoming -> "Sắp tới"
    else -> "Theo lịch"
}

private fun timingTone(duty: DutyItem): StatusTone = when {
    duty.isOngoing -> StatusTone.Positive
    duty.isOverdue -> StatusTone.Neutral
    duty.isUpcoming -> StatusTone.Primary
    else -> StatusTone.Neutral
}
