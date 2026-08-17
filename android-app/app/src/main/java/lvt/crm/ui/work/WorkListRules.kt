package lvt.crm.ui.work

import java.util.Calendar
import java.util.TimeZone
import lvt.crm.data.work.WorkApprovalItem
import lvt.crm.data.work.WorkTaskItem

enum class WorkListTab {
    Upcoming,
    Past,
    ;

    val title: String
        get() = when (this) {
            Upcoming -> "Chưa diễn ra"
            Past -> "Đã diễn ra"
        }
}

private val completedStatuses = setOf("completed", "completed_late")

fun vietnamToday(nowMillis: Long = System.currentTimeMillis()): String {
    val calendar = Calendar.getInstance(TimeZone.getTimeZone("GMT+07:00"))
    calendar.timeInMillis = nowMillis
    val year = calendar.get(Calendar.YEAR)
    val month = calendar.get(Calendar.MONTH) + 1
    val day = calendar.get(Calendar.DAY_OF_MONTH)
    return "%04d-%02d-%02d".format(year, month, day)
}

fun isTaskPast(task: WorkTaskItem, today: String = vietnamToday()): Boolean {
    if (task.status in completedStatuses) return true
    if (task.deadline.isBlank()) return false
    return task.deadline < today
}

fun isDocumentPast(document: WorkApprovalItem, today: String = vietnamToday()): Boolean {
    if (document.status in completedStatuses) return true
    val deadlines = document.assignments.map { it.deadline }.filter { it.isNotBlank() }
        .ifEmpty { listOfNotNull(document.deadline.takeIf { it.isNotBlank() }) }
    if (deadlines.isEmpty()) return false
    return deadlines.all { it < today }
}

fun filterTasksByTab(list: List<WorkTaskItem>, tab: WorkListTab, today: String = vietnamToday()): List<WorkTaskItem> {
    val filtered = if (tab == WorkListTab.Past) list.filter { isTaskPast(it, today) } else list.filter { !isTaskPast(it, today) }
    return filtered.sortedBy { it.deadline }
}

fun filterDocumentsByTab(
    list: List<WorkApprovalItem>,
    tab: WorkListTab,
    today: String = vietnamToday(),
): List<WorkApprovalItem> {
    val filtered = if (tab == WorkListTab.Past) {
        list.filter { isDocumentPast(it, today) }
    } else {
        list.filter { !isDocumentPast(it, today) }
    }
    return filtered.sortedBy { document ->
        document.assignments.map { it.deadline }.filter { it.isNotBlank() }.minOrNull()
            ?: document.deadline
    }
}

fun tabForTask(task: WorkTaskItem, today: String = vietnamToday()): WorkListTab =
    if (isTaskPast(task, today)) WorkListTab.Past else WorkListTab.Upcoming

fun tabForDocument(document: WorkApprovalItem, today: String = vietnamToday()): WorkListTab =
    if (isDocumentPast(document, today)) WorkListTab.Past else WorkListTab.Upcoming
