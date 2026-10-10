package lvt.crm.ui.homeroom

import android.app.DatePickerDialog
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.EventBusy
import androidx.compose.material.icons.outlined.HourglassEmpty
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale
import lvt.crm.data.homeroom.*
import lvt.crm.ui.components.LvtScreen

@Composable
fun HomeroomDetailScreen(viewModel: HomeroomDetailViewModel, onClose: () -> Unit) {
    val state by viewModel.uiState.collectAsState()
    var daily by remember { mutableStateOf(true) }
    var search by remember { mutableStateOf("") }
    var contactForm by remember(state.context, state.studentId) { mutableStateOf<HomeroomForm?>(null) }
    contactForm?.let { draft -> viewModel.writeOperations?.let { writes -> HomeroomWriteForm(draft, writes, { viewModel.uiState.value.context == draft.context && viewModel.uiState.value.studentId == draft.studentId && viewModel.uiState.value.error == null }, viewModel::clearWriteData, viewModel::refresh) { contactForm = null } } }
    val back = { if (state.studentId != null) viewModel.backToClass() else onClose() }
    BackHandler(onBack = back)
    LvtScreen(title = if (state.studentId != null) "Học sinh" else "Lớp", refreshing = state.loading, onRefresh = viewModel::refresh, showAccountHeader = true) {
        LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            item {
                OutlinedButton(onClick = back, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) { Text(if (state.studentId != null) "Trở lại lớp" else "Trở lại tổng quan") }
            }
            item(key = "absence-actions") {
                val data = state.classData
                val targets = if (daily && data?.daily?.canCorrect == true && !data.daily.archived) data.daily.rows.mapNotNull { row -> row.day?.takeIf { it.rawObservation == "absent" }?.let { AbsenceTarget(it.id, row.student.id, state.context, row.student.fullName) } } else emptyList()
                val requestContext = state.context
                AbsenceActions(targets, viewModel.writeOperations, { viewModel.uiState.value.context == requestContext && viewModel.uiState.value.studentId == null && viewModel.uiState.value.error == null }, viewModel::clearWriteData, viewModel::refresh)
            }
            if (state.studentId == null) {
                item {
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        DayNavigator(date = state.context.date, onDate = viewModel::selectDate)
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            FilterChip(selected = daily, onClick = { daily = true }, label = { Text("Điểm danh") }, modifier = Modifier.weight(1f).heightIn(min = 48.dp))
                            FilterChip(selected = !daily, onClick = { daily = false }, label = { Text("Danh sách lớp") }, modifier = Modifier.weight(1f).heightIn(min = 48.dp))
                        }
                        OutlinedTextField(value = search, onValueChange = { search = it }, label = { Text("Tìm học sinh") }, modifier = Modifier.fillMaxWidth(), singleLine = true)
                    }
                }
            } else {
                item {
                    HistoryDateButton("Lịch sử từ", state.context.from) { viewModel.selectHistoryRange(it, state.context.to) }
                    HistoryDateButton("Lịch sử đến", state.context.to) { viewModel.selectHistoryRange(state.context.from, it) }
                    Text("Ngày bắt đầu không được sau ngày kết thúc.", color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodySmall)
                }
            }
            when {
                state.loading -> item { CircularProgressIndicator(); Text("Đang tải…") }
                state.error != null -> item {
                    DetailCard("Chưa tải được dữ liệu", "${state.error}")
                    Button(onClick = viewModel::refresh, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) { Text("Thử lại") }
                }
                state.classData != null -> {
                    val data = state.classData!!
                    item {
                        Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                            Text(data.scoped.name.ifBlank { "Lớp ${data.scoped.code}" }, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleMedium)
                            Text(
                                listOfNotNull(HomeroomPresentation.dayTitle(state.context.date), "GVCN ${data.scoped.teacherName.ifBlank { "chưa phân công" }}", if (data.scoped.status == "archived") "Lớp đã lưu trữ" else null).joinToString(" · "),
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                style = MaterialTheme.typography.bodySmall,
                            )
                        }
                    }
                    if (daily) {
                        val schoolDay = data.daily.schoolDay
                        val rows = data.daily.rows.filter { matchesStudent(it.student, search) }
                        item {
                            when {
                                schoolDay.outsideYear -> HomeroomBanner("Ngoài năm học", "Không cần điểm danh.", HomeroomTone.Info, Icons.Outlined.EventBusy)
                                !schoolDay.isSchoolDay -> HomeroomBanner("Không phải ngày học", schoolDay.note.ifBlank { "Không cần điểm danh." }, HomeroomTone.Info, Icons.Outlined.EventBusy)
                                !data.daily.published -> HomeroomBanner("Chưa có dữ liệu điểm danh", "Dữ liệu sẽ hiện sau khi nhập từ camera.", HomeroomTone.Neutral, Icons.Outlined.HourglassEmpty)
                                else -> StatTiles(HomeroomPresentation.dailyStats(data.daily.rows.map { it.day?.effectiveStatus ?: "no_data" }))
                            }
                            if (rows.isEmpty()) Text(if (search.isBlank()) "Lớp chưa có học sinh." else "Không tìm thấy học sinh.", modifier = Modifier.padding(top = 8.dp))
                        }
                        val showStatus = data.daily.published && schoolDay.isSchoolDay && !schoolDay.outsideYear
                        itemsIndexed(rows, key = { _, row -> row.enrollmentId }) { index, row ->
                            ListSegment(index, rows.size) {
                                HomeroomListRow(
                                    title = row.student.fullName,
                                    subtitle = row.day?.note,
                                    chips = if (showStatus) listOf(HomeroomPresentation.studentChip(row.day?.effectiveStatus ?: "no_data", row.day?.rawObservedAt?.let(::attendanceClock))) else emptyList(),
                                    leading = row.rosterNumber?.toString() ?: "—",
                                    onClick = { viewModel.openStudent(row.student.id) },
                                )
                            }
                        }
                    } else {
                        val rows = data.roster.rows.filter { matchesStudent(it.student, search) }
                        item {
                            Text("${rows.size} học sinh", fontWeight = FontWeight.SemiBold)
                            if (rows.isEmpty()) Text(if (data.roster.rows.isEmpty()) "Lớp chưa có học sinh." else "Không tìm thấy học sinh.")
                        }
                        itemsIndexed(rows, key = { _, row -> row.student.id }) { index, row ->
                            ListSegment(index, rows.size) {
                                HomeroomListRow(
                                    title = row.student.fullName,
                                    subtitle = "Mã ${row.student.studentCode}",
                                    chips = emptyList(),
                                    leading = row.enrollment.rosterNumber?.toString() ?: "—",
                                    onClick = { viewModel.openStudent(row.student.id) },
                                )
                            }
                        }
                    }
                }
                state.studentData != null -> {
                    val data = state.studentData!!
                    val student = data.profile.student
                    item { DetailCard(student.fullName, "${student.studentCode} · ${data.profile.status}\nNgày sinh: ${student.dateOfBirth?.let(::formatDate) ?: "—"} · Giới tính: ${student.gender ?: "—"}") }
                    item {
                        if (data.profile.showContacts) {
                            Text("Điện thoại học sinh: ${student.studentPhone ?: "—"}")
                            data.profile.guardians.forEach { guardian ->
                                Text("${guardian.fullName} · ${relationshipText(guardian.relationship)} · ${guardian.phone ?: "—"}${if (guardian.isPrimaryContact) " · Liên hệ chính" else ""}\n${guardian.notes ?: ""}")
                                if (data.profile.canEditContacts) OutlinedButton(onClick = { contactForm = HomeroomForm(state.context, student.id, guardian = guardian, contactMode = "guardian") }, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) { Text("Sửa hoặc xóa · ${guardian.fullName}") }
                            }
                            if (data.profile.canEditContacts) {
                                OutlinedButton(onClick = { contactForm = HomeroomForm(state.context, student.id, initialPhone = student.studentPhone ?: "") }, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) { Text("Sửa điện thoại học sinh") }
                                OutlinedButton(enabled = data.profile.guardians.size < 6, onClick = { contactForm = HomeroomForm(state.context, student.id, contactMode = "guardian") }, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) { Text("Thêm người giám hộ · ${data.profile.guardians.size}/6") }
                            }
                        } else Text("Bạn không có quyền xem thông tin liên hệ.", color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    item { Text("Quá trình học", fontWeight = FontWeight.SemiBold) }
                    items(data.profile.enrollments) { row -> DetailCard("${row.classCode} · ${row.className}", "${formatDate(row.startDate)} → ${row.endDate?.let(::formatDate) ?: "Đang tiếp tục"}\n${if (row.current) "Hiện tại" else "Lịch sử"} · ${row.status}\n${row.transferReason ?: ""}") }
                    item {
                        DetailCard("Lịch sử điểm danh", "${formatDate(state.context.from)} → ${formatDate(state.context.to)} · ${data.history.days.size} buổi · ${data.history.corrections.size} lần điều chỉnh")
                        if (data.history.days.isEmpty()) Text("Chưa có buổi điểm danh nào trong khoảng này.")
                    }
                    val historyDays = data.history.days.asReversed()
                    itemsIndexed(historyDays, key = { _, row -> row.id }) { index, row ->
                        ListSegment(index, historyDays.size) {
                            HomeroomListRow(
                                title = HomeroomPresentation.dayTitle(row.date),
                                subtitle = listOfNotNull(row.record.rawObservedAt?.let(::attendanceClock), row.record.note?.takeIf { it.isNotBlank() }).joinToString(" · ").ifBlank { null },
                                chips = listOf(HomeroomPresentation.studentChip(row.record.effectiveStatus, row.record.rawObservedAt?.let(::attendanceClock))),
                            )
                        }
                    }
                    items(data.history.corrections.sortedByDescending { it.at }) { row -> DetailCard("Điều chỉnh ${formatDate(row.date)}", "${attendanceStatusText(row.previousStatus)} → ${attendanceStatusText(row.nextStatus)} · ${attendanceTimestamp(row.at)}${row.note?.takeIf { it.isNotBlank() }?.let { "\n$it" } ?: ""}") }
                }
            }
        }
    }
}

@Composable private fun DetailCard(title: String, text: String) {
    Card(Modifier.fillMaxWidth().heightIn(min = 48.dp)) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(title, fontWeight = FontWeight.SemiBold)
            Text(text)
        }
    }
}

@Composable private fun HistoryDateButton(label: String, date: String, onDate: (String) -> Unit) {
    val context = LocalContext.current
    OutlinedButton(onClick = {
        val selected = LocalDate.parse(date)
        DatePickerDialog(context, { _, year, month, day -> onDate(LocalDate.of(year, month + 1, day).toString()) }, selected.year, selected.monthValue - 1, selected.dayOfMonth).show()
    }, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) { Text("$label: ${formatDate(date)}") }
}

internal fun matchesStudent(student: StudentIdentity, search: String): Boolean {
    fun normalized(value: String): String = java.text.Normalizer.normalize(value.lowercase(Locale.ROOT).replace('đ', 'd'), java.text.Normalizer.Form.NFD).replace(Regex("\\p{M}+"), "")
    val term = normalized(search.trim())
    return normalized(student.fullName).contains(term) || normalized(student.studentCode).contains(term)
}

private fun attendanceClock(milliseconds: Double): String = DateTimeFormatter.ofPattern("HH:mm").withZone(ZoneId.of("Asia/Ho_Chi_Minh")).format(Instant.ofEpochMilli(milliseconds.toLong()))

private fun attendanceTimestamp(milliseconds: Double): String = DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm", Locale.forLanguageTag("vi-VN")).withZone(ZoneId.of("Asia/Ho_Chi_Minh")).format(Instant.ofEpochMilli(milliseconds.toLong()))
