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

fun filterTasksNeedingExecution(list: List<WorkTaskItem>): List<WorkTaskItem> =
    list.filter { needsCompletion(it.status) }.sortedBy { it.deadline }

fun tabForTask(task: WorkTaskItem, today: String = vietnamToday()): WorkListTab =
    if (isTaskPast(task, today)) WorkListTab.Past else WorkListTab.Upcoming

fun tabForDocument(document: WorkApprovalItem, today: String = vietnamToday()): WorkListTab =
    if (isDocumentPast(document, today)) WorkListTab.Past else WorkListTab.Upcoming

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
