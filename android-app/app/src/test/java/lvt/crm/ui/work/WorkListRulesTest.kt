package lvt.crm.ui.work

import lvt.crm.data.work.WorkApprovalItem
import lvt.crm.data.work.WorkDocumentAssignment
import lvt.crm.data.work.WorkMemberItem
import lvt.crm.data.work.WorkTaskItem
import lvt.crm.ui.components.ListSearchState
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
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

    @Test
    fun searchMatchesTitleContentDepartmentPersonAndDeadline() {
        val mine = task(
            id = "a",
            deadline = "2026-08-20",
            status = "pending_task",
            title = "Soạn báo cáo tuần",
            documentTitle = "Họp tổ chuyên môn",
            departmentName = "Tổ Toán",
            memberNames = listOf("Trần Anh Vũ"),
        )
        val created = document(
            id = "b",
            deadlines = listOf("2026-08-22"),
            title = "Đi thực tế",
            departmentName = "Phòng Tổ chức",
            memberName = "Admin",
        )
        assertEquals(listOf("a"), filterTasksBySearch(listOf(mine), ListSearchState(query = "hop to")).map { it.id })
        assertEquals(listOf("a"), filterTasksBySearch(listOf(mine), ListSearchState(query = "bao cao")).map { it.id })
        assertEquals(listOf("b"), filterDocumentsBySearch(listOf(created), ListSearchState(query = "thực tế")).map { it.id })
        assertEquals(listOf("a"), filterTasksBySearch(listOf(mine), ListSearchState(department = "to toan")).map { it.id })
        assertEquals(listOf("a"), filterTasksBySearch(listOf(mine), ListSearchState(person = "anh vu")).map { it.id })
        assertEquals(
            listOf("b"),
            filterDocumentsBySearch(listOf(created), ListSearchState(dateFrom = "2026-08-22", dateTo = "2026-08-22")).map { it.id },
        )
        assertEquals(
            emptyList<String>(),
            filterTasksBySearch(listOf(mine), ListSearchState(query = "hop", department = "to chuc")).map { it.id },
        )
        val filtered = WorkUiState(tasks = listOf(mine), search = ListSearchState(query = "khong co"))
        assertTrue(filtered.mineSearchEmpty)
        assertTrue(filtered.visibleMine.isEmpty())
    }

    private fun task(
        id: String,
        deadline: String,
        status: String,
        title: String = id,
        documentTitle: String = "",
        departmentName: String = "",
        memberNames: List<String> = emptyList(),
    ) = WorkTaskItem(
        id = id,
        kind = WorkTaskItem.Kind.WorkItem,
        title = title,
        deadline = deadline,
        status = status,
        documentContent = "",
        departmentName = departmentName,
        qualityPercent = null,
        rejectionReason = "",
        isAdmin = false,
        documentTitle = documentTitle,
        memberNames = memberNames,
    )

    private fun document(
        id: String,
        deadlines: List<String>,
        title: String = id,
        departmentName: String = "Tổ",
        memberName: String? = null,
    ) = WorkApprovalItem(
        id = id,
        fileName = "$id.pdf",
        content = title,
        deadline = deadlines.first(),
        status = "approved",
        approvalCount = 1,
        approvalTotal = 1,
        myDecision = "",
        assignments = deadlines.mapIndexed { index, deadline ->
            WorkDocumentAssignment(
                id = "$id-$index",
                departmentName = departmentName,
                content = title,
                deadline = deadline,
                status = "pending",
                members = listOfNotNull(
                    memberName?.let { WorkMemberItem(id = "m-$id", name = it, status = "pending") },
                ),
            )
        },
    )
}
