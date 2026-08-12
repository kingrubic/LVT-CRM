package lvt.crm.ui.profile

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.Computer
import androidx.compose.material.icons.outlined.Devices
import androidx.compose.material.icons.outlined.Language
import androidx.compose.material.icons.outlined.PhoneAndroid
import androidx.compose.material.icons.outlined.PhonelinkErase
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import lvt.crm.data.auth.DeviceSession
import lvt.crm.data.auth.SessionsRepository
import lvt.crm.data.convex.ConvexException
import java.util.concurrent.TimeUnit

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DevicesScreen(
    sessionsRepository: SessionsRepository,
    onBack: () -> Unit,
) {
    var sessions by remember { mutableStateOf<List<DeviceSession>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var pending by remember { mutableStateOf(false) }
    var feedback by remember { mutableStateOf<String?>(null) }
    var confirmRevokeId by remember { mutableStateOf<String?>(null) }
    var confirmRevokeOthers by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val now = remember { System.currentTimeMillis() }

    fun reload() {
        scope.launch {
            loading = true
            feedback = null
            sessionsRepository.listMine()
                .onSuccess {
                    sessions = it
                    loading = false
                }
                .onFailure {
                    feedback = (it as? ConvexException)?.message ?: it.message
                    loading = false
                }
        }
    }

    LaunchedEffect(Unit) { reload() }

    Column(modifier = Modifier.fillMaxSize()) {
        TopAppBar(
            title = { Text("Thiết bị") },
            navigationIcon = {
                IconButton(onClick = onBack) {
                    Icon(Icons.AutoMirrored.Outlined.ArrowBack, contentDescription = "Quay lại")
                }
            },
            actions = {
                IconButton(onClick = { reload() }, enabled = !loading && !pending) {
                    Icon(Icons.Outlined.Refresh, contentDescription = "Làm mới")
                }
            },
        )
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 16.dp),
        ) {
            Text(
                "Thu hồi phiên sẽ đăng xuất thiết bị và ngừng nhận thông báo.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(bottom = 16.dp),
            )
            feedback?.let {
                Text(
                    it,
                    color = MaterialTheme.colorScheme.error,
                    style = MaterialTheme.typography.bodySmall,
                    modifier = Modifier.padding(bottom = 10.dp),
                )
            }

            if (loading) {
                CircularProgressIndicator(modifier = Modifier.align(Alignment.CenterHorizontally))
                return@Column
            }

            val current = sessions.firstOrNull { it.isCurrent }
            val others = sessions.filterNot { it.isCurrent }

            if (current != null) {
                Text("THIẾT BỊ NÀY", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.outline)
                Spacer(modifier = Modifier.height(8.dp))
                SessionCard(current, now)
                if (others.isNotEmpty()) {
                    Spacer(modifier = Modifier.height(10.dp))
                    Button(
                        onClick = { confirmRevokeOthers = true },
                        enabled = !pending,
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Icon(Icons.Outlined.PhonelinkErase, contentDescription = null)
                        Text("Đăng xuất tất cả phiên khác", modifier = Modifier.padding(start = 8.dp))
                    }
                }
            }

            Spacer(modifier = Modifier.height(18.dp))
            Text("PHIÊN ĐĂNG NHẬP", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.outline)
            Spacer(modifier = Modifier.height(8.dp))
            if (others.isEmpty()) {
                Text("Không có phiên đăng nhập nào khác.", color = MaterialTheme.colorScheme.outline)
            } else {
                others.forEach { session ->
                    SessionCard(session, now)
                    TextButton(
                        onClick = { confirmRevokeId = session.sessionId },
                        enabled = !pending,
                        modifier = Modifier.align(Alignment.End),
                    ) {
                        Text("Thu hồi")
                    }
                    Spacer(modifier = Modifier.height(6.dp))
                }
            }
            Spacer(modifier = Modifier.height(24.dp))
        }
    }

    if (confirmRevokeOthers) {
        AlertDialog(
            onDismissRequest = { confirmRevokeOthers = false },
            title = { Text("Đăng xuất các phiên khác?") },
            text = { Text("Các thiết bị khác sẽ bị đăng xuất và ngừng nhận thông báo.") },
            confirmButton = {
                TextButton(onClick = {
                    confirmRevokeOthers = false
                    scope.launch {
                        pending = true
                        sessionsRepository.revokeAllOthers()
                            .onSuccess {
                                feedback = "Đã đăng xuất tất cả phiên khác."
                                reload()
                            }
                            .onFailure {
                                feedback = (it as? ConvexException)?.message ?: it.message
                            }
                        pending = false
                    }
                }) { Text("Xác nhận") }
            },
            dismissButton = {
                TextButton(onClick = { confirmRevokeOthers = false }) { Text("Hủy") }
            },
        )
    }
    confirmRevokeId?.let { sessionId ->
        AlertDialog(
            onDismissRequest = { confirmRevokeId = null },
            title = { Text("Thu hồi phiên này?") },
            text = { Text("Thiết bị đó sẽ bị đăng xuất ngay.") },
            confirmButton = {
                TextButton(onClick = {
                    confirmRevokeId = null
                    scope.launch {
                        pending = true
                        sessionsRepository.revoke(sessionId)
                            .onSuccess {
                                feedback = "Đã thu hồi phiên."
                                reload()
                            }
                            .onFailure {
                                feedback = (it as? ConvexException)?.message ?: it.message
                            }
                        pending = false
                    }
                }) { Text("Thu hồi") }
            },
            dismissButton = {
                TextButton(onClick = { confirmRevokeId = null }) { Text("Hủy") }
            },
        )
    }
}

@Composable
private fun SessionCard(session: DeviceSession, now: Long) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(bottom = 8.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
    ) {
        Row(
            modifier = Modifier.padding(14.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(
                deviceIcon(session.clientKind),
                contentDescription = null,
                tint = MaterialTheme.colorScheme.primary,
            )
            Column(modifier = Modifier.weight(1f)) {
                Text(session.deviceName, fontWeight = FontWeight.SemiBold)
                Text(session.platformLabel, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.outline)
                Text(
                    if (session.isCurrent) "Thiết bị này" else formatActiveAt(session.lastActiveAt, now),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.outline,
                )
            }
        }
    }
}

private fun deviceIcon(kind: String) = when (kind) {
    "ios" -> Icons.Outlined.PhoneAndroid
    "web" -> Icons.Outlined.Language
    "android" -> Icons.Outlined.PhoneAndroid
    else -> Icons.Outlined.Computer
}

private fun formatActiveAt(timestamp: Long, now: Long): String {
    if (timestamp <= 0L) return "—"
    val diff = (now - timestamp).coerceAtLeast(0L)
    if (diff < TimeUnit.MINUTES.toMillis(2)) return "trực tuyến"
    val minutes = TimeUnit.MILLISECONDS.toMinutes(diff)
    if (minutes < 60) return "$minutes phút trước"
    val hours = TimeUnit.MILLISECONDS.toHours(diff)
    if (hours < 24) return "$hours giờ trước"
    val days = TimeUnit.MILLISECONDS.toDays(diff)
    return if (days < 7) "$days ngày trước" else {
        val d = java.util.Calendar.getInstance().apply { timeInMillis = timestamp }
        "%02d/%02d/%02d".format(
            d.get(java.util.Calendar.DAY_OF_MONTH),
            d.get(java.util.Calendar.MONTH) + 1,
            d.get(java.util.Calendar.YEAR) % 100,
        )
    }
}
