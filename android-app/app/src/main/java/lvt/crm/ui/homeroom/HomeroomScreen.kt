package lvt.crm.ui.homeroom

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.CalendarMonth
import androidx.compose.material.icons.outlined.EventBusy
import androidx.compose.material.icons.outlined.TaskAlt
import androidx.compose.material.icons.outlined.Groups
import androidx.compose.material.icons.outlined.WarningAmber
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import java.time.LocalDate
import lvt.crm.data.homeroom.HomeroomClassSummary
import lvt.crm.data.homeroom.HomeroomOverview
import lvt.crm.data.homeroom.ImportStatus
import lvt.crm.ui.components.LvtScreen
import lvt.crm.ui.components.StatePanel

@Composable
fun HomeroomScreen(viewModel: HomeroomViewModel, canImport: Boolean = false, canManage: Boolean = false) {
    val state by viewModel.uiState.collectAsState()
    var camera by remember(viewModel) { mutableStateOf<lvt.crm.data.homeroom.CameraImportStore?>(null) }
    var management by remember(viewModel) { mutableStateOf<lvt.crm.data.homeroom.HomeroomManagementStore?>(null) }
    if (management != null) {
        HomeroomManagementScreen(management!!) { management = null; viewModel.refresh() }
        return
    }
    if (camera != null) {
        HomeroomCameraImportScreen(camera!!) { camera = null; viewModel.refresh() }
        return
    }
    val currentDetail by viewModel.detailState.collectAsState()
    if (currentDetail != null) {
        val selectedDetail = currentDetail!!
        androidx.compose.runtime.DisposableEffect(selectedDetail) {
            if (!selectedDetail.uiState.value.loading) selectedDetail.refresh()
            onDispose { selectedDetail.close() }
        }
        HomeroomDetailScreen(selectedDetail, viewModel::closeDetail)
        return
    }
    LvtScreen(
        title = "Lớp chủ nhiệm",
        refreshing = state.refreshing,
        onRefresh = viewModel::refresh,
        showAccountHeader = true,
    ) {
        Column(Modifier.fillMaxSize()) {
            if (state.years.isNotEmpty()) {
                Column(Modifier.padding(horizontal = 16.dp, vertical = 8.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    val actionsEnabled = !state.loading && !state.refreshing && state.selectedYearId != null
                    ContextControls(
                        years = state.years.map { it.id to it.name },
                        selectedYearId = state.selectedYearId,
                        onYear = viewModel::selectYear,
                        actions = buildList {
                            if (canImport) add("Nhập camera" to { camera = viewModel.cameraImport() })
                            if (canManage) add("Danh mục" to { management = viewModel.management() })
                        },
                        actionsEnabled = actionsEnabled,
                    )
                    DayNavigator(date = state.date, onDate = viewModel::selectDate)
                }
            }
            val year = state.years.firstOrNull { it.id == state.selectedYearId }
            val targets = if (!state.supervisor && state.pane == HomeroomPane.Pending && year != null) state.pending?.rows.orEmpty().filter { it.canCorrect && it.classId.isNotBlank() && it.studentId.isNotBlank() }.map { row -> lvt.crm.data.homeroom.AbsenceTarget(row.id, row.studentId, lvt.crm.data.homeroom.DetailContext(year.id, row.classId, row.attendanceDate, year.startDate, year.endDate), "${row.fullName} · ${row.classCode}") } else emptyList()
            val requestYear = state.selectedYearId
            val requestDate = state.date
            Box(Modifier.heightIn(max = 240.dp)) {
                androidx.compose.foundation.lazy.LazyColumn {
                    item { AbsenceActions(targets, viewModel.writeOperations, { viewModel.uiState.value.selectedYearId == requestYear && viewModel.uiState.value.date == requestDate && viewModel.uiState.value.pane == HomeroomPane.Pending && viewModel.uiState.value.error == null }, viewModel::clearWriteData, viewModel::refresh) }
                }
            }
            Box(Modifier.weight(1f)) {
                when {
                    state.loading -> CenteredLoading()
                    state.error != null -> StatePanel(
                        icon = Icons.Outlined.WarningAmber,
                        title = "Chưa tải được dữ liệu",
                        message = "${state.error.orEmpty()}\nNgày Việt Nam: ${formatDate(state.date)}",
                        action = { Button(onClick = viewModel::refresh) { Text("Thử lại") } },
                    )
                    state.years.isEmpty() -> StatePanel(
                        icon = Icons.Outlined.CalendarMonth,
                        title = "Chưa có năm học",
                        message = "Quản trị viên cần tạo năm học trước khi xem điểm danh.",
                    )
                    else -> LazyColumn(
                        modifier = Modifier.fillMaxSize(),
                        contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        if (state.supervisor) {
                            item { SupervisorNotice() }
                            item { ImportStatusCard(state.importStatus) }
                        } else {
                            item {
                                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                    FilterChip(
                                        selected = state.pane == HomeroomPane.Overview,
                                        onClick = { viewModel.selectPane(HomeroomPane.Overview) },
                                        label = { Text("Tổng quan") },
                                        modifier = Modifier.weight(1f).heightIn(min = 48.dp),
                                    )
                                    FilterChip(
                                        selected = state.pane == HomeroomPane.Pending,
                                        onClick = { viewModel.selectPane(HomeroomPane.Pending) },
                                        label = { Text("Vắng chờ xử lý (${state.pending?.total ?: 0})", maxLines = 1) },
                                        modifier = Modifier.weight(1f).heightIn(min = 48.dp),
                                    )
                                }
                            }
                            if (state.pane == HomeroomPane.Overview) {
                                overviewItems(state.overview) { klass ->
                                    viewModel.openClass(klass.id)
                                }
                            } else {
                                pendingItems(state.pending)
                            }
                        }
                    }
                }
            }
        }
    }
}

private fun androidx.compose.foundation.lazy.LazyListScope.overviewItems(overview: HomeroomOverview?, onClass: (HomeroomClassSummary) -> Unit) {
    if (overview == null) return
    val schoolDay = overview.schoolDay.isSchoolDay && !overview.schoolDay.outsideYear
    item {
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            when {
                overview.schoolDay.outsideYear -> HomeroomBanner("Ngoài năm học", "Ngày đã chọn nằm ngoài năm học ${overview.schoolYear.name}.", HomeroomTone.Info, Icons.Outlined.EventBusy)
                !overview.schoolDay.isSchoolDay -> HomeroomBanner(
                    if (overview.date == overview.today) "Hôm nay không phải ngày học" else "Không phải ngày học",
                    overview.schoolDay.note.ifBlank { "Không cần điểm danh." },
                    HomeroomTone.Info,
                    Icons.Outlined.EventBusy,
                )
                else -> {
                    StatTiles(HomeroomPresentation.overviewStats(overview.counts))
                    Text(
                        HomeroomPresentation.overviewSummary(overview.studentCount, overview.classes.size, overview.attendanceRate, overview.ratedRows),
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        style = MaterialTheme.typography.bodySmall,
                    )
                }
            }
            if (schoolDay && overview.missingUpload.shouldAlert) {
                HomeroomBanner(
                    "Còn ${overview.missingUpload.missingClassCodes.size} lớp chưa có dữ liệu",
                    "Đã quá ${overview.missingUpload.cutoffTime}: ${overview.missingUpload.missingClassCodes.joinToString()}",
                    HomeroomTone.Warning,
                    Icons.Outlined.WarningAmber,
                )
            }
        }
    }
    if (overview.classes.isEmpty()) {
        item { HomeroomBanner("Chưa có lớp", "Bạn chưa được phân công lớp chủ nhiệm trong ngày này.", HomeroomTone.Neutral, Icons.Outlined.Groups) }
    } else {
        itemsIndexed(overview.classes, key = { _, row -> row.id }) { index, row ->
            ListSegment(index, overview.classes.size) {
                HomeroomListRow(
                    title = HomeroomPresentation.classTitle(row),
                    subtitle = HomeroomPresentation.classSubtitle(row),
                    chips = HomeroomPresentation.classChips(row, schoolDay),
                    onClick = { onClass(row) },
                )
            }
        }
    }
}

private fun androidx.compose.foundation.lazy.LazyListScope.pendingItems(pending: lvt.crm.data.homeroom.PendingAbsences?) {
    if (pending == null) return
    item {
        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text("Các buổi vắng chưa phân loại trong năm học", fontWeight = FontWeight.SemiBold)
            if (pending.truncated) Text("Đang hiện ${pending.rows.size} buổi gần nhất trong ${pending.total} buổi.", color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodySmall)
        }
    }
    if (pending.rows.isEmpty()) {
        item { HomeroomBanner("Không còn buổi vắng nào chờ xử lý", null, HomeroomTone.Success, Icons.Outlined.TaskAlt) }
    } else {
        itemsIndexed(pending.rows, key = { _, row -> row.id }) { index, row ->
            ListSegment(index, pending.rows.size) {
                HomeroomListRow(
                    title = row.fullName,
                    subtitle = listOf("Lớp ${row.classCode}", HomeroomPresentation.dayTitle(row.attendanceDate), row.note).filter { it.isNotBlank() }.joinToString(" · "),
                    chips = listOf(HomeroomChip("Vắng", HomeroomTone.Danger)),
                )
            }
        }
    }
}

@Composable
private fun ContextControls(
    years: List<Pair<String, String>>,
    selectedYearId: String?,
    onYear: (String) -> Unit,
    actions: List<Pair<String, () -> Unit>>,
    actionsEnabled: Boolean,
) {
    var expanded by remember { mutableStateOf(false) }
    val selected = years.firstOrNull { it.first == selectedYearId }
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box {
            TextButton(onClick = { expanded = true }, modifier = Modifier.heightIn(min = 48.dp)) {
                Text("Năm học ${selected?.second ?: "—"}", fontWeight = FontWeight.SemiBold)
            }
            DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
                years.forEach { (id, name) ->
                    DropdownMenuItem(text = { Text(name) }, onClick = { expanded = false; onYear(id) })
                }
            }
        }
        Box(Modifier.weight(1f))
        actions.forEach { (label, action) ->
            OutlinedButton(enabled = actionsEnabled, onClick = action, modifier = Modifier.heightIn(min = 48.dp)) { Text(label, maxLines = 1) }
        }
    }
}

@Composable
private fun SupervisorNotice() = HomeroomBanner(
    "Tình trạng nhập điểm danh toàn trường",
    "Giám thị theo dõi việc nhập dữ liệu camera; danh sách lớp và học sinh chỉ dành cho GVCN và quản trị.",
    HomeroomTone.Info,
    Icons.Outlined.Groups,
)

@Composable
private fun ImportStatusCard(status: ImportStatus?) {
    val uploads = status?.uploads.orEmpty()
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        StatTiles(listOf(HomeroomStat(HomeroomPresentation.number(status?.publishedClassCount ?: 0), "Lớp đã có dữ liệu", HomeroomTone.Success)))
        if (uploads.isEmpty()) {
            HomeroomBanner("Chưa có tệp nào cho ngày này", null, HomeroomTone.Neutral, Icons.Outlined.CalendarMonth)
        } else {
            uploads.forEachIndexed { index, upload ->
                ListSegment(index, uploads.size) {
                    HomeroomListRow(
                        title = upload.fileName,
                        subtitle = "${upload.matchedCount}/${upload.rowCount} dòng khớp · ${upload.uploadedByName.ifBlank { "Không rõ người nhập" }}",
                        chips = emptyList(),
                    )
                }
            }
        }
    }
}

@Composable
private fun CenteredLoading() = Column(
    modifier = Modifier.fillMaxSize(),
    verticalArrangement = Arrangement.Center,
    horizontalAlignment = Alignment.CenterHorizontally,
) {
    CircularProgressIndicator()
    Text("Đang tải lớp chủ nhiệm…", modifier = Modifier.padding(top = 12.dp))
}

internal fun formatDate(value: String): String = runCatching {
    val date = LocalDate.parse(value)
    "%02d/%02d/%04d".format(date.dayOfMonth, date.monthValue, date.year)
}.getOrDefault(value)
