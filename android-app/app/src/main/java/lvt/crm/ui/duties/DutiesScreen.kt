package lvt.crm.ui.duties

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
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import lvt.crm.R
import lvt.crm.data.duties.DutyItem

@Composable
fun DutiesScreen(
    viewModel: DutiesViewModel,
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
            Text(stringResource(R.string.nav_duties), style = MaterialTheme.typography.headlineSmall)
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
            state.duties.isEmpty() -> {
                Text(
                    "Không có công tác nào.",
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
                    items(state.duties, key = { it.id }) { duty ->
                        DutyCard(
                            duty = duty,
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
    confirmationEnabled: Boolean,
    busy: Boolean,
    onAttend: () -> Unit,
    onAbsent: () -> Unit,
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.45f)),
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(duty.content.ifBlank { "Công tác" }, style = MaterialTheme.typography.titleMedium)
            Spacer(modifier = Modifier.height(6.dp))
            Text(
                scheduleLabel(duty),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f),
            )
            if (duty.locationNames.isNotEmpty()) {
                Text(
                    "Địa điểm: ${duty.locationNames.joinToString(", ")}",
                    style = MaterialTheme.typography.bodySmall,
                    modifier = Modifier.padding(top = 4.dp),
                )
            }
            Text(
                "Trạng thái: ${statusLabel(duty.myStatus)} · ${timingLabel(duty)}",
                style = MaterialTheme.typography.bodySmall,
                modifier = Modifier.padding(top = 6.dp),
            )

            if (confirmationEnabled && duty.isMine && duty.canMarkAttendance) {
                Spacer(modifier = Modifier.height(12.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button(onClick = onAttend, enabled = !busy) {
                        Text("Có mặt")
                    }
                    OutlinedButton(onClick = onAbsent, enabled = !busy) {
                        Text("Vắng")
                    }
                }
            }
        }
    }
}

private fun scheduleLabel(duty: DutyItem): String {
    val date = if (duty.startDate == duty.endDate) duty.startDate else "${duty.startDate} → ${duty.endDate}"
    val time = if (duty.allDay) "Cả ngày" else "${duty.startTime}–${duty.endTime}"
    return "$date · $time"
}

private fun statusLabel(status: String): String = when (status) {
    "attended" -> "Có mặt"
    "absent" -> "Vắng"
    "pending" -> "Chưa xác nhận"
    else -> status
}

private fun timingLabel(duty: DutyItem): String = when {
    duty.isOngoing -> "Đang diễn ra"
    duty.isOverdue -> "Đã hết hạn"
    duty.isUpcoming -> "Sắp tới"
    else -> ""
}
