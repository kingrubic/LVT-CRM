package lvt.crm.ui.work

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AssignmentLate
import androidx.compose.material.icons.outlined.Business
import androidx.compose.material.icons.outlined.CalendarMonth
import androidx.compose.material.icons.outlined.Check
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.CheckCircleOutline
import androidx.compose.material.icons.outlined.Description
import androidx.compose.material.icons.outlined.PersonOutline
import androidx.compose.material.icons.outlined.PendingActions
import androidx.compose.material.icons.outlined.Star
import androidx.compose.material.icons.outlined.TaskAlt
import androidx.compose.material.icons.outlined.WarningAmber
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.activity.compose.BackHandler
import androidx.compose.ui.Alignment
import androidx.compose.ui.draw.clip
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.compositeOver
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import lvt.crm.data.work.WorkTaskItem
import lvt.crm.data.work.WorkApprovalItem
import lvt.crm.data.work.WorkCompletionReviewItem
import lvt.crm.data.work.WorkDocumentAssignment
import lvt.crm.data.work.needsCompletion
import lvt.crm.ui.components.ScreenHeader
import lvt.crm.ui.components.StatePanel
import lvt.crm.ui.components.StatusPill
import lvt.crm.ui.components.StatusTone

@Composable
fun WorkScreen(
    viewModel: WorkViewModel,
    focusId: String?,
    tabOpenToken: Int,
) {
    val state by viewModel.uiState.collectAsState()
    if (state.isAdmin) {
        AdminWorkScreen(
            state = state,
            focusId = focusId,
            onRefresh = viewModel::refresh,
            onReview = viewModel::reviewCompletion,
        )
        return
    }
    val listState = rememberLazyListState()
    var pendingApprovalAction by remember { mutableStateOf<ApprovalAction?>(null) }
    var pendingCompletionTask by remember { mutableStateOf<WorkTaskItem?>(null) }
    var pendingFilterOnly by rememberSaveable { mutableStateOf(false) }
    val canApproveDocuments = state.accessLevel >= 4
    val orderedApprovals = orderedWorkApprovals(state.approvals)
    val pendingApprovalCount = orderedApprovals.count { it.myDecision.isBlank() }
    val pendingCompletionCount = state.tasks.count { needsCompletion(it.status) }
    val visibleApprovals = if (canApproveDocuments) {
        visibleWorkApprovals(orderedApprovals, pendingFilterOnly && focusId == null)
    } else {
        emptyList()
    }
    val visibleTasks = when {
        canApproveDocuments && pendingFilterOnly && focusId == null -> emptyList()
        !canApproveDocuments && pendingFilterOnly && focusId == null -> state.tasks.filter { needsCompletion(it.status) }
        else -> state.tasks
    }

    LaunchedEffect(focusId, visibleApprovals, visibleTasks) {
        val approvalIndex = visibleApprovals.indexOfFirst { it.id == focusId }
        if (approvalIndex >= 0) {
            listState.animateScrollToItem(approvalIndex + 1)
            return@LaunchedEffect
        }
        val taskIndex = visibleTasks.indexOfFirst { it.id == focusId }
        if (taskIndex >= 0) {
            val approvalOffset = if (visibleApprovals.isEmpty()) 0 else visibleApprovals.size + 1
            listState.animateScrollToItem(approvalOffset + taskIndex)
        }
    }
    LaunchedEffect(tabOpenToken) {
        if (visibleApprovals.isNotEmpty() || visibleTasks.isNotEmpty()) listState.scrollToItem(0)
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
            state.tasks.isEmpty() && state.approvals.isEmpty() -> {
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
                    WorkFilterPill(
                        label = if (canApproveDocuments) {
                            "$pendingApprovalCount công việc chờ duyệt"
                        } else {
                            "$pendingCompletionCount công việc chờ hoàn thành"
                        },
                        selected = pendingFilterOnly,
                        onClick = { pendingFilterOnly = !pendingFilterOnly },
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
                    if (visibleApprovals.isNotEmpty()) {
                        item {
                            Text(
                                "Công văn cần duyệt",
                                style = MaterialTheme.typography.titleLarge,
                                modifier = Modifier.padding(top = 2.dp),
                            )
                        }
                        items(visibleApprovals, key = { "approval-${it.id}" }) { approval ->
                            ApprovalCard(
                                approval = approval,
                                focused = approval.id == focusId,
                                busy = state.busyApprovalId != null || state.busyTaskId != null,
                                onDecision = { approve ->
                                    pendingApprovalAction = ApprovalAction(approval, approve)
                                },
                            )
                        }
                    }
                    if (canApproveDocuments && pendingFilterOnly && visibleApprovals.isEmpty()) {
                        item {
                            StatePanel(
                                icon = Icons.Outlined.CheckCircle,
                                title = "Không còn việc chờ duyệt",
                                message = "Bạn đã xử lý tất cả công việc cần duyệt.",
                            )
                        }
                    }
                    if (!canApproveDocuments && pendingFilterOnly && visibleTasks.isEmpty()) {
                        item {
                            StatePanel(
                                icon = Icons.Outlined.CheckCircle,
                                title = "Không còn việc chờ hoàn thành",
                                message = "Bạn đã hoàn tất tất cả công việc cần xử lý.",
                            )
                        }
                    }
                    items(visibleTasks, key = { "${it.kind}-${it.id}" }) { task ->
                        WorkCard(
                            task = task,
                            focused = task.id == focusId,
                            busy = state.busyTaskId != null || state.busyApprovalId != null,
                            onComplete = {
                                if (task.isAdmin) {
                                    viewModel.requestComplete(task)
                                } else {
                                    pendingCompletionTask = task
                                }
                            },
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

    val approvalAction = pendingApprovalAction
    if (approvalAction != null) {
        AlertDialog(
            onDismissRequest = { pendingApprovalAction = null },
            title = {
                Text(if (approvalAction.approve) "Xác nhận duyệt" else "Xác nhận không duyệt")
            },
            text = {
                Text(
                    if (approvalAction.approve) {
                        "Ba có chắc chắn duyệt công văn này không? Quyết định sẽ không thể thay đổi."
                    } else {
                        "Ba có chắc chắn không duyệt công văn này không? Quyết định sẽ không thể thay đổi."
                    },
                )
            },
            confirmButton = {
                Button(
                    onClick = {
                        pendingApprovalAction = null
                        viewModel.decideApproval(approvalAction.approval, approvalAction.approve)
                    },
                ) {
                    Text("Tôi chắc chắn")
                }
            },
            dismissButton = {
                TextButton(onClick = { pendingApprovalAction = null }) {
                    Text("Hủy")
                }
            },
        )
    }

    val completionTask = pendingCompletionTask
    if (completionTask != null) {
        AlertDialog(
            onDismissRequest = { pendingCompletionTask = null },
            title = { Text("Xác nhận hoàn thành") },
            text = {
                Text(
                    "Ba có chắc chắn báo đã hoàn thành công việc “${completionTask.title}” không?",
                )
            },
            confirmButton = {
                Button(
                    onClick = {
                        pendingCompletionTask = null
                        viewModel.requestComplete(completionTask)
                    },
                ) {
                    Text("Tôi chắc chắn")
                }
            },
            dismissButton = {
                TextButton(onClick = { pendingCompletionTask = null }) {
                    Text("Hủy")
                }
            },
        )
    }
}

internal enum class AdminDocumentFilter { All, Pending, Approved, PendingCompletion }

@Composable
private fun AdminWorkScreen(
    state: WorkUiState,
    focusId: String?,
    onRefresh: () -> Unit,
    onReview: (WorkCompletionReviewItem, Boolean, Int?, String?) -> Unit,
) {
    var filter by rememberSaveable { mutableStateOf(AdminDocumentFilter.All) }
    var selectedDocumentId by rememberSaveable { mutableStateOf<String?>(null) }
    val selectedDocument = currentAdminDocument(state.approvals, selectedDocumentId)
    var selectedReview by remember { mutableStateOf<WorkCompletionReviewItem?>(null) }
    var qualityPercent by rememberSaveable { mutableStateOf("100") }
    var rejectionReason by rememberSaveable { mutableStateOf("") }
    val pendingReviews = state.completionReviews.associateBy { it.workItemId + it.userId }
    val documents = visibleAdminDocuments(state.approvals, state.completionReviews, filter)
    val allCount = state.approvals.size
    val pendingCount = state.approvals.count { it.status == "pending" }
    val approvedCount = state.approvals.count { it.status == "approved" }

    BackHandler(enabled = selectedDocumentId != null && selectedReview == null) {
        selectedDocumentId = null
    }
    LaunchedEffect(focusId, state.approvals) {
        val focusedDocument = focusedAdminDocument(state.approvals, focusId)
        if (focusedDocument != null) selectedDocumentId = focusedDocument.id
    }
    LaunchedEffect(selectedDocumentId, selectedDocument) {
        if (selectedDocumentId != null && selectedDocument == null && !state.loading) {
            selectedDocumentId = null
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 18.dp),
    ) {
        ScreenHeader(
            title = if (selectedDocument == null) "Công văn" else "Công việc",
            subtitle = if (selectedDocument == null) {
                "Công văn chờ duyệt và đã duyệt"
            } else {
                "Theo dõi tiến độ theo phòng ban và người thực hiện"
            },
            icon = Icons.Outlined.TaskAlt,
            refreshing = state.refreshing,
            onRefresh = onRefresh,
        )

        when {
            state.loading -> LoadingWorkPanel()
            state.error != null -> WorkLoadError(state.error.orEmpty(), onRefresh)
            selectedDocument == null -> {
                AdminDocumentTabs(
                    selected = filter,
                    allCount = allCount,
                    pendingCount = pendingCount,
                    approvedCount = approvedCount,
                    onSelect = { filter = it },
                )
                if (state.completionReviews.isNotEmpty()) {
                    Card(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(bottom = 16.dp)
                            .clickable { filter = AdminDocumentFilter.PendingCompletion },
                        colors = CardDefaults.cardColors(
                            containerColor = MaterialTheme.colorScheme.tertiaryContainer.copy(alpha = .62f),
                        ),
                        shape = MaterialTheme.shapes.medium,
                    ) {
                        Row(
                            modifier = Modifier.padding(horizontal = 16.dp, vertical = 13.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(10.dp),
                        ) {
                            Icon(
                                Icons.Outlined.AssignmentLate,
                                contentDescription = null,
                                tint = MaterialTheme.colorScheme.onTertiaryContainer,
                            )
                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    "${state.completionReviews.size} task chờ duyệt hoàn thành",
                                    style = MaterialTheme.typography.titleSmall,
                                    color = MaterialTheme.colorScheme.onTertiaryContainer,
                                )
                                Text(
                                    "Chạm để lọc đúng công văn cần xử lý",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onTertiaryContainer.copy(alpha = .76f),
                                )
                            }
                            Text("›", style = MaterialTheme.typography.headlineSmall, color = MaterialTheme.colorScheme.onTertiaryContainer)
                        }
                    }
                }
                if (documents.isEmpty()) {
                    StatePanel(
                        icon = Icons.Outlined.Description,
                        title = "Chưa có công văn",
                        message = "Không có công văn thuộc nhóm đang chọn.",
                    )
                } else {
                    LazyColumn(
                        modifier = Modifier.weight(1f),
                        contentPadding = PaddingValues(bottom = 28.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        items(documents, key = { it.id }) { document ->
                            AdminDocumentCard(document = document, onOpen = { selectedDocumentId = document.id })
                        }
                    }
                }
            }
            else -> {
                val document = selectedDocument ?: return@Column
                TextButton(
                    onClick = { selectedDocumentId = null },
                    modifier = Modifier.padding(bottom = 6.dp),
                ) {
                    Text("← Danh sách công văn")
                }
                LazyColumn(
                    modifier = Modifier.weight(1f),
                    contentPadding = PaddingValues(bottom = 28.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    item { DocumentSummaryCard(document) }
                    if (document.assignments.isEmpty()) {
                        item {
                            StatePanel(
                                icon = Icons.Outlined.TaskAlt,
                                title = "Chưa có công việc được phân công",
                                message = "Công văn này chưa có đầu mục công việc.",
                            )
                        }
                    }
                    document.assignments.groupBy { it.departmentName.ifBlank { "Chưa gán phòng ban" } }
                        .forEach { (departmentName, assignments) ->
                            item(key = "department-$departmentName") {
                                Text(
                                    departmentName.uppercase(),
                                    style = MaterialTheme.typography.labelLarge,
                                    color = MaterialTheme.colorScheme.primary,
                                    modifier = Modifier.padding(top = 8.dp),
                                )
                            }
                            items(assignments, key = { it.id }) { assignment ->
                                AdminAssignmentCard(
                                    assignment = assignment,
                                    pendingReviews = pendingReviews,
                                    busy = state.busyReviewId != null,
                                    onReview = { review ->
                                        qualityPercent = "100"
                                        rejectionReason = ""
                                        selectedReview = review
                                    },
                                )
                            }
                        }
                }
            }
        }

        state.actionError?.let { message ->
            Text(
                message,
                color = MaterialTheme.colorScheme.error,
                style = MaterialTheme.typography.bodySmall,
                modifier = Modifier.padding(vertical = 8.dp),
            )
        }
    }

    selectedReview?.let { review ->
        val quality = qualityPercent.toIntOrNull()
        AlertDialog(
            onDismissRequest = { selectedReview = null },
            title = { Text("Duyệt hoàn thành") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text("${review.userName} · ${review.content}")
                    OutlinedTextField(
                        value = qualityPercent,
                        onValueChange = { qualityPercent = it.filter(Char::isDigit).take(3) },
                        label = { Text("% chất lượng khi duyệt") },
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    )
                    OutlinedTextField(
                        value = rejectionReason,
                        onValueChange = { rejectionReason = it.take(500) },
                        label = { Text("Lý do nếu chưa duyệt") },
                    )
                }
            },
            confirmButton = {
                Button(
                    enabled = quality != null && quality in 0..100,
                    onClick = {
                        selectedReview = null
                        onReview(review, true, quality, null)
                    },
                ) { Text("Duyệt") }
            },
            dismissButton = {
                TextButton(
                    enabled = rejectionReason.isNotBlank(),
                    onClick = {
                        selectedReview = null
                        onReview(review, false, null, rejectionReason)
                    },
                ) { Text("Chưa duyệt") }
            },
        )
    }
}

@Composable
private fun LoadingWorkPanel() {
    Column(
        modifier = Modifier.fillMaxSize(),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        CircularProgressIndicator()
        Text("Đang tải công việc…", modifier = Modifier.padding(top = 14.dp))
    }
}

@Composable
private fun WorkLoadError(message: String, onRefresh: () -> Unit) {
    StatePanel(
        icon = Icons.Outlined.WarningAmber,
        title = "Chưa tải được công việc",
        message = message,
        action = { Button(onClick = onRefresh) { Text("Thử lại") } },
    )
}

@Composable
private fun AdminDocumentCard(document: WorkApprovalItem, onOpen: () -> Unit) {
    val extension = document.fileName.substringAfterLast('.', "CV").uppercase().take(4)
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onOpen),
        shape = MaterialTheme.shapes.medium,
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = .7f)),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
    ) {
        Row(
            modifier = Modifier.padding(16.dp),
            horizontalArrangement = Arrangement.spacedBy(14.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                modifier = Modifier
                    .size(48.dp)
                    .clip(MaterialTheme.shapes.medium)
                    .background(
                        if (extension == "PDF") MaterialTheme.colorScheme.errorContainer.copy(alpha = .55f)
                        else MaterialTheme.colorScheme.primaryContainer.copy(alpha = .58f),
                    ),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    extension,
                    style = MaterialTheme.typography.labelLarge,
                    color = if (extension == "PDF") MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary,
                )
            }
            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(5.dp)) {
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(
                        document.fileName.ifBlank { "Công văn" },
                        style = MaterialTheme.typography.titleMedium,
                        modifier = Modifier.weight(1f),
                        maxLines = 2,
                    )
                    StatusPill(
                        label = if (document.status == "approved") "Đã duyệt" else "Chờ duyệt",
                        tone = if (document.status == "approved") StatusTone.Positive else StatusTone.Warning,
                    )
                }
                if (document.content.isNotBlank()) {
                    Text(document.content, style = MaterialTheme.typography.bodySmall, maxLines = 1)
                }
                Text(
                    "Hạn ${document.deadline}  ·  ${document.assignments.size} đầu mục",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Text("›", style = MaterialTheme.typography.headlineSmall, color = MaterialTheme.colorScheme.outline)
        }
    }
}

@Composable
private fun AdminDocumentTabs(
    selected: AdminDocumentFilter,
    allCount: Int,
    pendingCount: Int,
    approvedCount: Int,
    onSelect: (AdminDocumentFilter) -> Unit,
) {
    val tabs = listOf(
        AdminDocumentFilter.All to "Tất cả ($allCount)",
        AdminDocumentFilter.Pending to "Chờ duyệt ($pendingCount)",
        AdminDocumentFilter.Approved to "Đã duyệt ($approvedCount)",
    )
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(bottom = 14.dp)
            .clip(MaterialTheme.shapes.large)
            .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = .52f))
            .padding(4.dp),
        horizontalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        tabs.forEach { (value, label) ->
            val isSelected = selected == value
            Text(
                label,
                style = MaterialTheme.typography.labelLarge,
                color = if (isSelected) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                textAlign = TextAlign.Center,
                modifier = Modifier
                    .weight(1f)
                    .clip(MaterialTheme.shapes.medium)
                    .background(if (isSelected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surface.copy(alpha = .01f))
                    .clickable { onSelect(value) }
                    .padding(vertical = 10.dp),
            )
        }
    }
}

internal fun visibleAdminDocuments(
    documents: List<WorkApprovalItem>,
    reviews: List<WorkCompletionReviewItem>,
    filter: AdminDocumentFilter,
): List<WorkApprovalItem> {
    val reviewItemIds = reviews.mapTo(mutableSetOf()) { it.workItemId }
    return documents.filter { document ->
        when (filter) {
            AdminDocumentFilter.All -> true
            AdminDocumentFilter.Pending -> document.status == "pending"
            AdminDocumentFilter.Approved -> document.status == "approved"
            AdminDocumentFilter.PendingCompletion -> document.assignments.any { it.id in reviewItemIds }
        }
    }
}

internal fun currentAdminDocument(
    documents: List<WorkApprovalItem>,
    selectedDocumentId: String?,
): WorkApprovalItem? = documents.firstOrNull { it.id == selectedDocumentId }

internal fun focusedAdminDocument(
    documents: List<WorkApprovalItem>,
    focusId: String?,
): WorkApprovalItem? = documents.firstOrNull { document ->
    document.id == focusId || document.assignments.any { it.id == focusId }
}

@Composable
private fun DocumentSummaryCard(document: WorkApprovalItem) {
    val members = document.assignments.flatMap { it.members }
    val completedCount = members.count { it.status in completedWorkStatuses }
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = MaterialTheme.shapes.medium,
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = .7f)),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
    ) {
        Row(
            modifier = Modifier.padding(18.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Box(
                modifier = Modifier
                    .size(58.dp)
                    .clip(MaterialTheme.shapes.medium)
                    .background(MaterialTheme.colorScheme.primaryContainer),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    Icons.Outlined.Description,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.size(31.dp),
                )
            }
            Column(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(5.dp),
            ) {
                Text(document.fileName.ifBlank { "Công văn" }, style = MaterialTheme.typography.titleMedium, maxLines = 2)
                if (document.content.isNotBlank()) {
                    Text(
                        document.content,
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1,
                    )
                }
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    Icon(
                        Icons.Outlined.CalendarMonth,
                        contentDescription = null,
                        modifier = Modifier.size(17.dp),
                        tint = MaterialTheme.colorScheme.primary,
                    )
                    Text(
                        "Hạn ${document.deadline}",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
            Column(
                modifier = Modifier
                    .clip(MaterialTheme.shapes.medium)
                    .background(
                        if (completedCount == members.size && members.isNotEmpty()) {
                            MaterialTheme.colorScheme.secondaryContainer
                        } else {
                            MaterialTheme.colorScheme.primaryContainer.copy(alpha = .62f)
                        },
                    )
                    .padding(horizontal = 12.dp, vertical = 9.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Text(
                    "$completedCount/${members.size}",
                    style = MaterialTheme.typography.titleLarge,
                    color = if (completedCount == members.size && members.isNotEmpty()) {
                        MaterialTheme.colorScheme.secondary
                    } else {
                        MaterialTheme.colorScheme.primary
                    },
                )
                Text(
                    "hoàn thành",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

@Composable
private fun AdminAssignmentCard(
    assignment: WorkDocumentAssignment,
    pendingReviews: Map<String, WorkCompletionReviewItem>,
    busy: Boolean,
    onReview: (WorkCompletionReviewItem) -> Unit,
) {
    val completedCount = assignment.members.count { it.status in completedWorkStatuses }
    val pendingReviewCount = assignment.members.count { member ->
        pendingReviews.containsKey(assignment.id + member.id)
    }
    val allCompleted = assignment.members.isNotEmpty() && completedCount == assignment.members.size
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = MaterialTheme.shapes.medium,
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = .72f)),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(MaterialTheme.shapes.small)
                    .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = .52f))
                    .padding(horizontal = 12.dp, vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(9.dp),
            ) {
                Icon(
                    Icons.Outlined.Description,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.size(20.dp),
                )
                Text("${assignment.members.size} công việc", style = MaterialTheme.typography.labelLarge)
                Text("·", color = MaterialTheme.colorScheme.outline)
                Icon(
                    Icons.Outlined.CheckCircleOutline,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.secondary,
                    modifier = Modifier.size(20.dp),
                )
                Text("$completedCount hoàn thành", style = MaterialTheme.typography.labelLarge)
                if (pendingReviewCount > 0) {
                    Text("·", color = MaterialTheme.colorScheme.outline)
                    Icon(
                        Icons.Outlined.PendingActions,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.tertiary,
                        modifier = Modifier.size(20.dp),
                    )
                    Text("$pendingReviewCount chờ duyệt", style = MaterialTheme.typography.labelLarge)
                }
            }
            Row(
                modifier = Modifier.padding(top = 14.dp, bottom = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Icon(
                    Icons.Outlined.CalendarMonth,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.size(20.dp),
                )
                Text(
                    "Hạn: ${assignment.deadline}",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = .7f))
            assignment.members.forEachIndexed { index, member ->
                val review = pendingReviews[assignment.id + member.id]
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 13.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    Box(
                        modifier = Modifier
                            .size(38.dp)
                            .clip(MaterialTheme.shapes.small)
                            .background(MaterialTheme.colorScheme.primaryContainer.copy(alpha = .58f)),
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(
                            Icons.Outlined.PersonOutline,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.primary,
                            modifier = Modifier.size(22.dp),
                        )
                    }
                    Text(member.name, style = MaterialTheme.typography.titleSmall, modifier = Modifier.weight(1f))
                    memberStatusPill(member.status)?.let { (label, tone) ->
                        StatusPill(label = label, tone = tone)
                    }
                }
                if (index < assignment.members.lastIndex) {
                    HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = .55f))
                }
            }
            if (pendingReviewCount > 0) {
                val nextReview = assignment.members
                    .mapNotNull { member -> pendingReviews[assignment.id + member.id] }
                    .first()
                Button(
                    onClick = { onReview(nextReview) },
                    enabled = !busy,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = 14.dp),
                ) {
                    Icon(Icons.Outlined.PendingActions, contentDescription = null, modifier = Modifier.size(19.dp))
                    Text("Xử lý $pendingReviewCount yêu cầu duyệt", modifier = Modifier.padding(start = 8.dp))
                }
            } else if (allCompleted) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = 14.dp)
                        .clip(MaterialTheme.shapes.small)
                        .background(MaterialTheme.colorScheme.secondaryContainer.copy(alpha = .72f))
                        .padding(horizontal = 14.dp, vertical = 12.dp),
                    horizontalArrangement = Arrangement.Center,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(
                        Icons.Outlined.CheckCircle,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.secondary,
                        modifier = Modifier.size(21.dp),
                    )
                    Text(
                        "Hoàn thành $completedCount/${assignment.members.size} công việc",
                        style = MaterialTheme.typography.labelLarge,
                        modifier = Modifier.padding(start = 8.dp),
                    )
                }
            }
        }
    }
}

private val completedWorkStatuses = setOf("completed", "approved", "done", "completed_late")

private fun memberStatusPill(status: String): Pair<String, StatusTone>? = when (status) {
    "pending_completion", "pending_approval" -> "Chờ duyệt hoàn thành" to StatusTone.Warning
    "completed", "approved", "done", "completed_late" -> "Đã hoàn thành" to StatusTone.Positive
    "overdue", "rejected_completion", "rejected" -> workStatusLabel(status) to StatusTone.Warning
    else -> null
}

@Composable
private fun WorkFilterPill(
    label: String,
    selected: Boolean,
    onClick: () -> Unit,
) {
    Text(
        label,
        style = MaterialTheme.typography.labelLarge,
        color = MaterialTheme.colorScheme.primary,
        modifier = Modifier
            .clip(CircleShape)
            .clickable(onClick = onClick)
            .background(
                if (selected) {
                    MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.52f)
                } else {
                    MaterialTheme.colorScheme.surface.copy(alpha = 0.01f)
                },
            )
            .border(
                BorderStroke(1.dp, MaterialTheme.colorScheme.primary),
                CircleShape,
            )
            .padding(horizontal = 14.dp, vertical = 8.dp),
    )
}

internal fun orderedWorkApprovals(
    approvals: List<WorkApprovalItem>,
): List<WorkApprovalItem> = approvals.sortedWith(
    compareBy<WorkApprovalItem>(
        { it.myDecision.isNotBlank() },
        { it.deadline },
    ),
)

internal fun visibleWorkApprovals(
    approvals: List<WorkApprovalItem>,
    pendingOnly: Boolean,
): List<WorkApprovalItem> = if (pendingOnly) {
    approvals.filter { it.myDecision.isBlank() }
} else {
    approvals
}

private data class ApprovalAction(
    val approval: WorkApprovalItem,
    val approve: Boolean,
)

@Composable
private fun ApprovalCard(
    approval: WorkApprovalItem,
    focused: Boolean,
    busy: Boolean,
    onDecision: (Boolean) -> Unit,
) {
    val isPending = approval.myDecision.isBlank()
    val accentColor = when (approval.myDecision) {
        "approved" -> MaterialTheme.colorScheme.secondary
        "rejected" -> MaterialTheme.colorScheme.error
        else -> MaterialTheme.colorScheme.primary
    }
    val cardContainerColor = when (approval.myDecision) {
        "approved" -> MaterialTheme.colorScheme.secondaryContainer
            .copy(alpha = 0.12f)
            .compositeOver(MaterialTheme.colorScheme.surface)
        "rejected" -> MaterialTheme.colorScheme.errorContainer
            .copy(alpha = 0.12f)
            .compositeOver(MaterialTheme.colorScheme.surface)
        else -> MaterialTheme.colorScheme.primaryContainer
            .copy(alpha = 0.16f)
            .compositeOver(MaterialTheme.colorScheme.surface)
    }
    val cardBorderColor = when (approval.myDecision) {
        "approved" -> MaterialTheme.colorScheme.secondary.copy(alpha = 0.48f)
        "rejected" -> MaterialTheme.colorScheme.error.copy(alpha = 0.48f)
        else -> MaterialTheme.colorScheme.primary.copy(alpha = 0.42f)
    }

    Box(
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = 7.dp),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .height(IntrinsicSize.Max)
                .padding(start = 8.dp),
            verticalAlignment = Alignment.Top,
        ) {
            Box(
                modifier = Modifier
                    .width(6.dp)
                    .fillMaxHeight()
                    .clip(MaterialTheme.shapes.small)
                    .background(accentColor),
            )
            Card(
                modifier = Modifier.weight(1f),
                shape = MaterialTheme.shapes.medium,
                colors = CardDefaults.cardColors(containerColor = cardContainerColor),
                border = BorderStroke(if (focused) 2.dp else 1.dp, if (focused) MaterialTheme.colorScheme.primary else cardBorderColor),
                elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
            ) {
                Column(modifier = Modifier.padding(17.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.Top,
                    ) {
                        Row(
                            modifier = Modifier.weight(1f),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(10.dp),
                        ) {
                            Box(
                                modifier = Modifier
                                    .size(42.dp)
                                    .clip(MaterialTheme.shapes.small)
                                    .background(MaterialTheme.colorScheme.primaryContainer),
                                contentAlignment = Alignment.Center,
                            ) {
                                Icon(
                                    Icons.Outlined.Description,
                                    contentDescription = null,
                                    tint = MaterialTheme.colorScheme.primary,
                                )
                            }
                            Text(
                                approval.fileName.ifBlank { "Công văn" },
                                style = MaterialTheme.typography.titleMedium,
                            )
                        }
                        StatusPill(
                            label = "Chờ duyệt",
                            tone = StatusTone.Warning,
                        )
                    }
                    if (approval.content.isNotBlank()) {
                        DetailLine(
                            icon = Icons.Outlined.Description,
                            text = approval.content,
                            modifier = Modifier.padding(top = 10.dp),
                        )
                    }
                    DetailLine(
                        icon = Icons.Outlined.CalendarMonth,
                        text = "Hạn ${approval.deadline}",
                        modifier = Modifier.padding(top = 8.dp),
                    )
                    DetailLine(
                        icon = Icons.Outlined.CheckCircle,
                        text = "Đã duyệt ${approval.approvalCount}/${approval.approvalTotal}",
                    )
                    if (isPending) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(top = 14.dp),
                            horizontalArrangement = Arrangement.spacedBy(10.dp),
                        ) {
                            Button(
                                onClick = { onDecision(true) },
                                enabled = !busy,
                                modifier = Modifier.weight(1f),
                            ) {
                                Text("Duyệt")
                            }
                            OutlinedButton(
                                onClick = { onDecision(false) },
                                enabled = !busy,
                                modifier = Modifier.weight(1f),
                            ) {
                                Text("Không duyệt")
                            }
                        }
                    } else {
                        StatusPill(
                            label = if (approval.myDecision == "approved") "Đã duyệt" else "Đã từ chối",
                            tone = if (approval.myDecision == "approved") {
                                StatusTone.Positive
                            } else {
                                StatusTone.Warning
                            },
                        )
                    }
                }
            }
        }
        Box(
            modifier = Modifier
                .align(Alignment.TopStart)
                .offset(x = (-2).dp, y = (-5).dp)
                .size(31.dp)
                .clip(CircleShape)
                .background(accentColor),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                if (isPending) Icons.Outlined.Star else Icons.Outlined.Check,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onPrimary,
                modifier = Modifier.size(20.dp),
            )
        }
    }
}

@Composable
private fun WorkCard(
    task: WorkTaskItem,
    focused: Boolean,
    busy: Boolean,
    onComplete: () -> Unit,
) {
    val canComplete = needsCompletion(task.status)
    val isRejected = task.status in setOf("rejected", "rejected_completion")
    val isCompleted = task.status in setOf("completed", "approved", "done", "completed_late")
    val accentColor = when {
        isRejected -> MaterialTheme.colorScheme.error
        isCompleted -> MaterialTheme.colorScheme.secondary
        else -> MaterialTheme.colorScheme.primary
    }
    val cardContainerColor = when {
        isRejected -> MaterialTheme.colorScheme.errorContainer
            .copy(alpha = 0.12f)
            .compositeOver(MaterialTheme.colorScheme.surface)
        isCompleted -> MaterialTheme.colorScheme.secondaryContainer
            .copy(alpha = 0.12f)
            .compositeOver(MaterialTheme.colorScheme.surface)
        else -> MaterialTheme.colorScheme.primaryContainer
            .copy(alpha = 0.16f)
            .compositeOver(MaterialTheme.colorScheme.surface)
    }
    val cardBorderColor = if (focused) {
        MaterialTheme.colorScheme.primary
    } else {
        accentColor.copy(alpha = 0.42f)
    }

    Box(
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = 7.dp),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .height(IntrinsicSize.Max)
                .padding(start = 8.dp),
            verticalAlignment = Alignment.Top,
        ) {
            Box(
                modifier = Modifier
                    .width(6.dp)
                    .fillMaxHeight()
                    .clip(MaterialTheme.shapes.small)
                    .background(accentColor),
            )
            Card(
                modifier = Modifier.weight(1f),
                shape = MaterialTheme.shapes.medium,
                colors = CardDefaults.cardColors(containerColor = cardContainerColor),
                border = BorderStroke(if (focused) 2.dp else 1.dp, cardBorderColor),
                elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
            ) {
                Column(modifier = Modifier.padding(17.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.Top,
                    ) {
                        Row(
                            modifier = Modifier.weight(1f),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(10.dp),
                        ) {
                            Box(
                                modifier = Modifier
                                    .size(42.dp)
                                    .clip(MaterialTheme.shapes.small)
                                    .background(MaterialTheme.colorScheme.primaryContainer),
                                contentAlignment = Alignment.Center,
                            ) {
                                Icon(
                                    Icons.Outlined.Description,
                                    contentDescription = null,
                                    tint = MaterialTheme.colorScheme.primary,
                                )
                            }
                            Text(
                                task.title.ifBlank { "Công việc" },
                                style = MaterialTheme.typography.titleMedium,
                            )
                        }
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
        Box(
            modifier = Modifier
                .align(Alignment.TopStart)
                .offset(x = (-2).dp, y = (-5).dp)
                .size(31.dp)
                .clip(CircleShape)
                .background(accentColor),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                if (isCompleted) Icons.Outlined.Check else Icons.Outlined.Star,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onPrimary,
                modifier = Modifier.size(20.dp),
            )
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
    val base = workStatusLabel(task.status)
    return if (task.qualityPercent != null) "$base · ${task.qualityPercent}%" else base
}

private fun workStatusLabel(status: String): String {
    return when (status) {
        "pending_task", "pending" -> "Chưa hoàn thành"
        "overdue" -> "Quá hạn"
        "pending_completion", "pending_approval" -> "Chờ duyệt hoàn thành"
        "completed", "approved", "done" -> "Đã hoàn thành"
        "completed_late" -> "Hoàn thành muộn"
        "rejected_completion", "rejected" -> "Bị từ chối"
        else -> status
    }
}

private fun workStatusTone(status: String): StatusTone = when (status) {
    "completed", "approved", "done" -> StatusTone.Positive
    "overdue", "rejected_completion", "rejected" -> StatusTone.Warning
    "pending_completion", "pending_approval" -> StatusTone.Primary
    else -> StatusTone.Neutral
}
