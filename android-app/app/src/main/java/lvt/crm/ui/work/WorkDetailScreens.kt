package lvt.crm.ui.work

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.Description
import androidx.compose.material.icons.outlined.Groups
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import lvt.crm.data.work.WorkApprovalItem
import lvt.crm.data.work.WorkTaskItem
import lvt.crm.data.work.needsCompletion
import lvt.crm.ui.components.LvtScreen

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun WorkDocumentDetailScreen(
    document: WorkApprovalItem,
    onBack: () -> Unit,
    onOpenFile: () -> Unit,
) {
    BackHandler(onBack = onBack)
    val grouped = document.assignments.groupBy { it.departmentName.ifBlank { "Khác" } }
        .toSortedMap()
    LvtScreen(
        title = "Chi tiết công văn",
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
                .padding(bottom = 28.dp),
        ) {
            ListItem(
                headlineContent = {
                    Text(document.fileName.ifBlank { document.content.ifBlank { "Công văn" } })
                },
                supportingContent = {
                    val body = buildList {
                        if (document.fileName.isNotBlank() && document.content.isNotBlank()) {
                            add(document.content)
                        }
                        add("Hạn: ${document.deadline}")
                        add("Phê duyệt: ${document.approvalCount}/${document.approvalTotal}")
                    }
                    Text(body.joinToString("\n"))
                },
                leadingContent = {
                    Icon(Icons.Outlined.Description, contentDescription = null)
                },
                modifier = Modifier.clickable(enabled = document.fileName.isNotBlank(), onClick = onOpenFile),
            )
            if (document.fileName.isNotBlank()) {
                Button(
                    onClick = onOpenFile,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 8.dp),
                ) {
                    Text("Mở tệp")
                }
            }
            grouped.forEach { (department, assignments) ->
                HorizontalDivider()
                Text(
                    department,
                    style = MaterialTheme.typography.titleSmall,
                    color = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp),
                )
                assignments.forEach { assignment ->
                    val members = assignment.members.joinToString("\n") { member ->
                        "${member.name}: ${member.status}"
                    }
                    ListItem(
                        headlineContent = { Text(assignment.content.ifBlank { department }) },
                        supportingContent = {
                            Text(
                                buildList {
                                    add("Hạn: ${assignment.deadline}")
                                    if (members.isNotBlank()) add(members)
                                }.joinToString("\n"),
                            )
                        },
                        leadingContent = {
                            Icon(Icons.Outlined.Groups, contentDescription = null)
                        },
                    )
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun WorkTaskDetailScreen(
    task: WorkTaskItem,
    busy: Boolean,
    onBack: () -> Unit,
    onComplete: () -> Unit,
) {
    BackHandler(onBack = onBack)
    LvtScreen(
        title = "Chi tiết nhiệm vụ",
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
                .padding(horizontal = 20.dp, vertical = 16.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Text(task.title, style = MaterialTheme.typography.headlineSmall)
            Text(
                workStatusLabel(task),
                style = MaterialTheme.typography.titleMedium,
                color = when (workStatusTone(task.status)) {
                    lvt.crm.ui.components.StatusTone.Positive -> MaterialTheme.colorScheme.primary
                    lvt.crm.ui.components.StatusTone.Warning -> MaterialTheme.colorScheme.error
                    else -> MaterialTheme.colorScheme.secondary
                },
            )
            if (task.documentContent.isNotBlank()) {
                Text(task.documentContent, style = MaterialTheme.typography.bodyLarge)
            }
            if (task.departmentName.isNotBlank()) {
                Text("Đơn vị: ${task.departmentName}", color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Text("Hạn: ${task.deadline}", color = MaterialTheme.colorScheme.onSurfaceVariant)
            task.qualityPercent?.let {
                Text("Chất lượng: $it%", color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            if (task.note.isNotBlank()) {
                Text(
                    "Nội dung đã gửi người giao: ${task.note}",
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            if (task.rejectionReason.isNotBlank()) {
                Text(
                    "Lý do từ chối: ${task.rejectionReason}",
                    color = MaterialTheme.colorScheme.error,
                )
            }
            if (needsCompletion(task.status)) {
                Spacer(modifier = Modifier.height(8.dp))
                Button(
                    onClick = onComplete,
                    enabled = !busy,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text(if (busy) "Đang xử lý…" else "Hoàn thành")
                }
            }
        }
    }
}
