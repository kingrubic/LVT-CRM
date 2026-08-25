package lvt.crm.ui.work

import java.util.Calendar
import java.util.TimeZone
import lvt.crm.data.work.WorkApprovalItem
import lvt.crm.data.work.WorkTaskItem
import lvt.crm.data.work.needsCompletion
import lvt.crm.ui.components.ListSearchState
import lvt.crm.ui.components.anyDateInRange
import lvt.crm.ui.components.includesListSearch
import lvt.crm.ui.components.normalizeListSearchText

enum class WorkDashboardFilter {
    PendingApproval,
    NeedsExecution,
}

enum class WorkListTab {
    Incomplete,
    Completed,
    Upcoming,
    Overdue,
    ;

    val title: String
        get() = when (this) {
            Incomplete -> "Chưa hoàn thành"
            Completed -> "Đã hoàn thành"
            Upcoming -> "Chưa đến hạn"
            Overdue -> "Đã quá hạn"
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

fun isTaskCompleted(task: WorkTaskItem): Boolean = task.status in completedStatuses

fun isDocumentCompleted(document: WorkApprovalItem): Boolean {
    if (document.status in completedStatuses) return true
    val assignmentStatuses = document.assignments.map { it.status }
    return assignmentStatuses.isNotEmpty() && assignmentStatuses.all { it in completedStatuses }
}

fun isTaskOverdue(task: WorkTaskItem, today: String = vietnamToday()): Boolean {
    if (isTaskCompleted(task)) return false
    if (task.deadline.isBlank()) return false
    return task.deadline < today
}

fun isDocumentOverdue(document: WorkApprovalItem, today: String = vietnamToday()): Boolean {
    if (isDocumentCompleted(document)) return false
    val deadlines = document.assignments.map { it.deadline }.filter { it.isNotBlank() }
        .ifEmpty { listOfNotNull(document.deadline.takeIf { it.isNotBlank() }) }
    if (deadlines.isEmpty()) return false
    return deadlines.all { it < today }
}

fun isTaskPast(task: WorkTaskItem, today: String = vietnamToday()): Boolean {
    if (isTaskCompleted(task)) return true
    return isTaskOverdue(task, today)
}

fun isDocumentPast(document: WorkApprovalItem, today: String = vietnamToday()): Boolean {
    if (isDocumentCompleted(document)) return true
    return isDocumentOverdue(document, today)
}

fun filterTasksByTab(list: List<WorkTaskItem>, tab: WorkListTab, today: String = vietnamToday()): List<WorkTaskItem> {
    val filtered = when (tab) {
        WorkListTab.Completed -> list.filter { isTaskCompleted(it) }
        WorkListTab.Overdue -> list.filter { isTaskOverdue(it, today) }
        WorkListTab.Upcoming -> list.filter { !isTaskCompleted(it) && !isTaskOverdue(it, today) }
        WorkListTab.Incomplete -> list.filter { !isTaskCompleted(it) }
    }
    return filtered.sortedBy { it.deadline }
}

fun filterDocumentsByTab(
    list: List<WorkApprovalItem>,
    tab: WorkListTab,
    today: String = vietnamToday(),
): List<WorkApprovalItem> {
    val filtered = when (tab) {
        WorkListTab.Completed -> list.filter { isDocumentCompleted(it) }
        WorkListTab.Overdue -> list.filter { isDocumentOverdue(it, today) }
        WorkListTab.Upcoming -> list.filter { !isDocumentCompleted(it) && !isDocumentOverdue(it, today) }
        WorkListTab.Incomplete -> list.filter { !isDocumentCompleted(it) }
    }
    return filtered.sortedBy { document ->
        document.assignments.map { it.deadline }.filter { it.isNotBlank() }.minOrNull()
            ?: document.deadline
    }
}

fun filterTasksNeedingExecution(list: List<WorkTaskItem>): List<WorkTaskItem> =
    list.filter { needsCompletion(it.status) }.sortedBy { it.deadline }

fun tabForTask(task: WorkTaskItem, today: String = vietnamToday()): WorkListTab =
    when {
        isTaskCompleted(task) -> WorkListTab.Completed
        isTaskOverdue(task, today) -> WorkListTab.Overdue
        else -> WorkListTab.Incomplete
    }

fun tabForDocument(document: WorkApprovalItem, today: String = vietnamToday()): WorkListTab =
    when {
        isDocumentCompleted(document) -> WorkListTab.Completed
        isDocumentOverdue(document, today) -> WorkListTab.Overdue
        else -> WorkListTab.Incomplete
    }

fun filterTasksBySearch(list: List<WorkTaskItem>, search: ListSearchState): List<WorkTaskItem> {
    val query = normalizeListSearchText(search.query)
    val department = normalizeListSearchText(search.department)
    val person = normalizeListSearchText(search.person)
    val dateFrom = search.dateFrom.trim()
    val dateTo = search.dateTo.trim()
    if (query.isBlank() && department.isBlank() && person.isBlank() && dateFrom.isBlank() && dateTo.isBlank()) {
        return list
    }
    return list.filter { task ->
        val queryText = listOf(task.title, task.documentTitle, task.fileName, task.documentContent)
            .joinToString(" ")
        if (query.isNotBlank() && !includesListSearch(queryText, query)) return@filter false
        if (!includesListSearch(task.departmentName, department)) return@filter false
        if (!includesListSearch(task.memberNames.joinToString(" "), person)) return@filter false
        anyDateInRange(listOf(task.deadline), dateFrom, dateTo)
    }
}

fun filterDocumentsBySearch(list: List<WorkApprovalItem>, search: ListSearchState): List<WorkApprovalItem> {
    val query = normalizeListSearchText(search.query)
    val department = normalizeListSearchText(search.department)
    val person = normalizeListSearchText(search.person)
    val dateFrom = search.dateFrom.trim()
    val dateTo = search.dateTo.trim()
    if (query.isBlank() && department.isBlank() && person.isBlank() && dateFrom.isBlank() && dateTo.isBlank()) {
        return list
    }
    return list.filter { document ->
        val queryText = buildList {
            add(document.fileName)
            add(document.content)
            document.assignments.forEach { add(it.content) }
        }.joinToString(" ")
        val departmentText = document.assignments.joinToString(" ") { it.departmentName }
        val personText = document.assignments
            .flatMap { assignment -> assignment.members.map { it.name } }
            .joinToString(" ")
        val deadlines = document.assignments.map { it.deadline }.filter { it.isNotBlank() }
            .ifEmpty { listOfNotNull(document.deadline.takeIf { it.isNotBlank() }) }
        if (query.isNotBlank() && !includesListSearch(queryText, query)) return@filter false
        if (!includesListSearch(departmentText, department)) return@filter false
        if (!includesListSearch(personText, person)) return@filter false
        anyDateInRange(deadlines, dateFrom, dateTo)
    }
}
