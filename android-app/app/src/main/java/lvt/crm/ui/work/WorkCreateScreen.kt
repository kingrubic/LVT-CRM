package lvt.crm.ui.work

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.CalendarMonth
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.Description
import androidx.compose.material.icons.outlined.Image
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import lvt.crm.data.work.WorkCreateAssignment
import lvt.crm.data.work.WorkFormDepartment
import lvt.crm.data.work.WorkFormUser
import lvt.crm.data.work.formatWorkDeadline
import lvt.crm.ui.components.LvtScreen

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun WorkCreateScreen(
    viewModel: WorkViewModel,
    onBack: () -> Unit,
    onCreated: () -> Unit,
) {
    val state by viewModel.uiState.collectAsState()
    val context = LocalContext.current
    var title by remember { mutableStateOf("") }
    val assignments = remember { mutableStateListOf<WorkCreateAssignment>() }
    var fileName by remember { mutableStateOf("") }
    var fileBytes by remember { mutableStateOf<ByteArray?>(null) }
    var fileMime by remember { mutableStateOf<String?>(null) }
    var localError by remember { mutableStateOf<String?>(null) }
    var pickerIndex by remember { mutableStateOf<Int?>(null) }
    var dateIndex by remember { mutableStateOf<Int?>(null) }
    val options = state.formOptions
    val showDepartments = state.isOps
    val error = localError ?: state.actionError

    LaunchedEffect(Unit) {
        viewModel.loadFormOptions()
    }

    val photoPickerLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.PickVisualMedia(),
    ) { uri: Uri? ->
        if (uri == null) return@rememberLauncherForActivityResult
        val picked = readWorkAttachment(context, uri)
        if (picked.error != null) {
            localError = picked.error
        } else if (picked.file != null) {
            fileBytes = picked.file.bytes
            fileName = picked.file.fileName
            fileMime = picked.file.mimeType
            localError = null
        }
    }
    val documentPickerLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.OpenDocument(),
    ) { uri: Uri? ->
        if (uri == null) return@rememberLauncherForActivityResult
        val picked = readWorkAttachment(context, uri)
        if (picked.error != null) {
            localError = picked.error
        } else if (picked.file != null) {
            fileBytes = picked.file.bytes
            fileName = picked.file.fileName
            fileMime = picked.file.mimeType
            localError = null
        }
    }

    LvtScreen(
        title = "Tạo công việc",
        navigationIcon = {
            IconButton(onClick = onBack) {
                Icon(Icons.AutoMirrored.Outlined.ArrowBack, contentDescription = "Quay lại")
            }
        },
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            if (state.formOptionsLoading && options == null) {
                CircularProgressIndicator(modifier = Modifier.padding(top = 24.dp))
            }
            OutlinedTextField(
                value = title,
                onValueChange = { title = it.take(200) },
                label = { Text("Tên công việc") },
                supportingText = { Text("${title.trim().length}/200") },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
            )
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                if (showDepartments) {
                    OutlinedButton(onClick = {
                        assignments += WorkCreateAssignment(
                            type = "department",
                            deadline = formatWorkDeadline(System.currentTimeMillis()),
                        )
                    }) {
                        Text("＋ Phòng ban")
                    }
                }
                OutlinedButton(onClick = {
                    assignments += WorkCreateAssignment(
                        type = "individual",
                        deadline = formatWorkDeadline(System.currentTimeMillis()),
                    )
                }) {
                    Text("＋ Cá nhân")
                }
            }
            if (assignments.isEmpty()) {
                Text(
                    if (showDepartments) {
                        "Bấm ＋ Phòng ban hoặc ＋ Cá nhân để thêm người nhận việc."
                    } else {
                        "Bấm ＋ Cá nhân để thêm người nhận việc."
                    },
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            assignments.forEachIndexed { index, row ->
                WorkCreateAssignmentCard(
                    index = index,
                    row = row,
                    departments = options?.departments.orEmpty(),
                    users = options?.users.orEmpty(),
                    onChange = { assignments[index] = it },
                    onRemove = { assignments.removeAt(index) },
                    onPickTarget = { pickerIndex = index },
                    onPickDate = { dateIndex = index },
                )
            }
            Text("Tệp đính kèm (không bắt buộc)", style = MaterialTheme.typography.titleSmall)
            if (fileName.isNotBlank()) {
                Text(fileName, style = MaterialTheme.typography.bodyMedium)
                TextButton(onClick = {
                    fileBytes = null
                    fileName = ""
                    fileMime = null
                }) { Text("Gỡ tệp") }
            }
            OutlinedButton(
                onClick = {
                    photoPickerLauncher.launch(
                        PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly),
                    )
                },
                modifier = Modifier.fillMaxWidth(),
            ) {
                Icon(Icons.Outlined.Image, contentDescription = null)
                Spacer(Modifier.width(8.dp))
                Text("Chọn từ Thư viện ảnh")
            }
            OutlinedButton(
                onClick = {
                    documentPickerLauncher.launch(
                        arrayOf(
                            "application/pdf",
                            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                            "application/vnd.ms-excel",
                            "image/*",
                        ),
                    )
                },
                modifier = Modifier.fillMaxWidth(),
            ) {
                Icon(Icons.Outlined.Description, contentDescription = null)
                Spacer(Modifier.width(8.dp))
                Text("Chọn từ Tệp (PDF, Word, Excel)")
            }
            error?.let { message ->
                Text(message, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
            }
            Button(
                onClick = {
                    localError = null
                    viewModel.createDocument(
                        title = title,
                        assignments = assignments.toList(),
                        fileBytes = fileBytes,
                        fileName = fileName.takeIf { it.isNotBlank() },
                        mimeType = fileMime,
                        onSuccess = onCreated,
                    )
                },
                enabled = !state.creating && !state.formOptionsLoading,
                modifier = Modifier.fillMaxWidth(),
            ) {
                if (state.creating) {
                    CircularProgressIndicator(
                        modifier = Modifier
                            .height(18.dp)
                            .width(18.dp),
                        strokeWidth = 2.dp,
                    )
                    Spacer(Modifier.width(8.dp))
                }
                Text(if (state.creating) "Đang tạo…" else "Tạo công việc")
            }
            Spacer(modifier = Modifier.height(28.dp))
        }
    }

    val pickIndex = pickerIndex
    if (pickIndex != null && pickIndex in assignments.indices) {
        val row = assignments[pickIndex]
        val items = if (row.isIndividual) {
            options?.users.orEmpty()
                .filter { it.id == row.userIds.firstOrNull() || it.id !in assignments.filter { item -> item.isIndividual }.flatMap { it.userIds } }
                .map { it.id to "${it.name}${if (it.departmentName.isNotBlank()) " · ${it.departmentName}" else ""}" }
        } else {
            options?.departments.orEmpty()
                .filter { it.id == row.departmentId || it.id !in assignments.filter { !it.isIndividual }.map { it.departmentId } }
                .map { it.id to it.name }
        }
        WorkChoiceDialog(
            title = if (row.isIndividual) "Chọn người nhận" else "Chọn phòng ban",
            items = items,
            onSelect = { id ->
                assignments[pickIndex] = if (row.isIndividual) {
                    row.copy(userIds = listOf(id))
                } else {
                    row.copy(departmentId = id)
                }
                pickerIndex = null
            },
            onDismiss = { pickerIndex = null },
        )
    }

    val deadlineIndex = dateIndex
    if (deadlineIndex != null && deadlineIndex in assignments.indices) {
        val pickerState = rememberDatePickerState()
        DatePickerDialog(
            onDismissRequest = { dateIndex = null },
            confirmButton = {
                TextButton(onClick = {
                    pickerState.selectedDateMillis?.let { millis ->
                        assignments[deadlineIndex] = assignments[deadlineIndex].copy(
                            deadline = formatWorkDeadline(millis),
                        )
                    }
                    dateIndex = null
                }) { Text("Chọn") }
            },
            dismissButton = {
                TextButton(onClick = { dateIndex = null }) { Text("Hủy") }
            },
        ) {
            DatePicker(state = pickerState)
        }
    }
}

@Composable
private fun WorkCreateAssignmentCard(
    index: Int,
    row: WorkCreateAssignment,
    departments: List<WorkFormDepartment>,
    users: List<WorkFormUser>,
    onChange: (WorkCreateAssignment) -> Unit,
    onRemove: () -> Unit,
    onPickTarget: () -> Unit,
    onPickDate: () -> Unit,
) {
    val targetLabel = if (row.isIndividual) {
        val user = users.firstOrNull { it.id == row.userIds.firstOrNull() }
        user?.let { "${it.name}${if (it.departmentName.isNotBlank()) " · ${it.departmentName}" else ""}" }
            ?: "Chọn người nhận"
    } else {
        departments.firstOrNull { it.id == row.departmentId }?.name ?: "Chọn phòng ban"
    }
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Row {
                Text(
                    if (row.isIndividual) "Phân công ${index + 1} · Cá nhân" else "Phân công ${index + 1} · Phòng ban",
                    style = MaterialTheme.typography.titleSmall,
                    modifier = Modifier.weight(1f),
                )
                IconButton(onClick = onRemove) {
                    Icon(Icons.Outlined.Close, contentDescription = "Xóa phân công")
                }
            }
            OutlinedButton(onClick = onPickTarget, modifier = Modifier.fillMaxWidth()) {
                Text(targetLabel)
            }
            OutlinedTextField(
                value = row.content,
                onValueChange = { onChange(row.copy(content = it.take(2000))) },
                label = { Text("Nội dung công việc") },
                supportingText = { Text("${row.content.trim().length}/2000") },
                modifier = Modifier.fillMaxWidth(),
                minLines = 2,
            )
            OutlinedButton(onClick = onPickDate, modifier = Modifier.fillMaxWidth()) {
                Icon(Icons.Outlined.CalendarMonth, contentDescription = null)
                Spacer(Modifier.width(8.dp))
                Text(if (row.deadline.isBlank()) "Chọn hạn chót" else "Hạn chót ${row.deadline}")
            }
        }
    }
}

@Composable
private fun WorkChoiceDialog(
    title: String,
    items: List<Pair<String, String>>,
    onSelect: (String) -> Unit,
    onDismiss: () -> Unit,
) {
    androidx.compose.material3.AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(max = 360.dp)
                    .verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                if (items.isEmpty()) {
                    Text("Không còn lựa chọn phù hợp.")
                } else {
                    items.forEach { (id, label) ->
                        TextButton(onClick = { onSelect(id) }, modifier = Modifier.fillMaxWidth()) {
                            Text(label)
                        }
                    }
                }
            }
        },
        confirmButton = {
            TextButton(onClick = onDismiss) { Text("Đóng") }
        },
    )
}
