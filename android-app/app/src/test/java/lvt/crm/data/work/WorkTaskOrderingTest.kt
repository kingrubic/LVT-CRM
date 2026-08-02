package lvt.crm.data.work

import org.junit.Assert.assertEquals
import org.junit.Test

class WorkTaskOrderingTest {
    @Test
    fun tasksNeedingCompletionStayBeforeCompletedTasks() {
        val completed = task("completed", "2026-07-29", "completed")
        val pendingLater = task("pending-later", "2026-07-31", "pending")
        val overdue = task("overdue", "2026-07-28", "overdue")
        val pendingSooner = task("pending-sooner", "2026-07-30", "pending")

        assertEquals(
            listOf("overdue", "pending-sooner", "pending-later", "completed"),
            orderedWorkTasks(listOf(completed, pendingLater, overdue, pendingSooner)).map { it.id },
        )
    }

    @Test
    fun completionFilterOnlyIncludesActionableStatuses() {
        assertEquals(true, needsCompletion("pending"))
        assertEquals(true, needsCompletion("rejected_completion"))
        assertEquals(false, needsCompletion("pending_completion"))
        assertEquals(false, needsCompletion("completed"))
    }

    private fun task(id: String, deadline: String, status: String) = WorkTaskItem(
        id = id,
        kind = WorkTaskItem.Kind.PersonalTask,
        title = id,
        deadline = deadline,
        status = status,
        documentContent = "",
        departmentName = "",
        qualityPercent = null,
        rejectionReason = "",
        isAdmin = false,
    )
}
