package lvt.crm.ui.work

import lvt.crm.data.work.WorkApprovalItem
import lvt.crm.data.work.WorkDocumentAssignment
import lvt.crm.data.work.WorkTaskItem
import org.junit.Assert.assertEquals
import org.junit.Test

class WorkListRulesTest {
    @Test
    fun upcomingTabDropsCompletedAndExpiredTasks() {
        val today = "2026-08-17"
        val open = task("a", "2026-08-20", "pending_task")
        val done = task("b", "2026-08-20", "completed")
        val late = task("c", "2026-08-10", "overdue")
        assertEquals(listOf("a"), filterTasksByTab(listOf(open, done, late), WorkListTab.Upcoming, today).map { it.id })
        assertEquals(listOf("c", "b"), filterTasksByTab(listOf(open, done, late), WorkListTab.Past, today).map { it.id })
        assertEquals(listOf("c", "a"), filterTasksNeedingExecution(listOf(open, done, late)).map { it.id })
        val filtered = WorkUiState(
            tasks = listOf(open, done, late),
            mineTab = WorkListTab.Upcoming,
            needsExecutionOnly = true,
        )
        assertEquals(listOf("c", "a"), filtered.visibleMine.map { it.id })
    }

    @Test
    fun documentIsPastOnlyWhenEveryAssignmentDeadlinePassed() {
        val today = "2026-08-17"
        val mixed = document("mixed", listOf("2026-08-10", "2026-08-20"))
        val ended = document("ended", listOf("2026-08-01", "2026-08-02"))
        assertEquals(false, isDocumentPast(mixed, today))
        assertEquals(true, isDocumentPast(ended, today))
    }

    private fun task(id: String, deadline: String, status: String) = WorkTaskItem(
        id = id,
        kind = WorkTaskItem.Kind.WorkItem,
        title = id,
        deadline = deadline,
        status = status,
        documentContent = "",
        departmentName = "",
        qualityPercent = null,
        rejectionReason = "",
        isAdmin = false,
    )

    private fun document(id: String, deadlines: List<String>) = WorkApprovalItem(
        id = id,
        fileName = "$id.pdf",
        content = id,
        deadline = deadlines.first(),
        status = "approved",
        approvalCount = 1,
        approvalTotal = 1,
        myDecision = "",
        assignments = deadlines.mapIndexed { index, deadline ->
            WorkDocumentAssignment(
                id = "$id-$index",
                departmentName = "Tổ",
                content = "Việc",
                deadline = deadline,
                status = "pending",
                members = emptyList(),
            )
        },
    )
}
