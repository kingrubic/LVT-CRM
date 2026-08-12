package lvt.crm.ui.work

import lvt.crm.data.work.WorkApprovalItem
import lvt.crm.data.work.WorkTaskItem
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class WorkFocusRoutingTest {
    @Test
    fun findsApprovalOrTaskFromNotificationFocus() {
        val approval = WorkApprovalItem(
            id = "doc-1",
            fileName = "cv.pdf",
            content = "Nội dung",
            deadline = "2026-08-12",
            status = "pending",
            approvalCount = 0,
            approvalTotal = 1,
            myDecision = "",
        )
        val task = WorkTaskItem(
            id = "task-1",
            kind = WorkTaskItem.Kind.WorkItem,
            title = "Việc",
            deadline = "2026-08-12",
            status = "pending",
            documentContent = "",
            departmentName = "P1",
            qualityPercent = null,
            rejectionReason = "",
            isAdmin = false,
        )
        val approvals = listOf(approval)
        val tasks = listOf(task)
        assertEquals("doc-1", approvals.firstOrNull { it.id == "doc-1" }?.id)
        assertEquals("task-1", tasks.firstOrNull { it.id == "task-1" }?.id)
        assertNull(approvals.firstOrNull { it.id == "missing" })
        assertNull(tasks.firstOrNull { it.id == "missing" })
    }

    @Test
    fun adminFocusMatchesDocumentOrAssignment() {
        val document = WorkApprovalItem(
            id = "doc-2",
            fileName = "cv.pdf",
            content = "",
            deadline = "2026-08-12",
            status = "pending",
            approvalCount = 0,
            approvalTotal = 1,
            myDecision = "",
            assignments = listOf(
                lvt.crm.data.work.WorkDocumentAssignment(
                    id = "asg-9",
                    departmentName = "P1",
                    content = "Việc A",
                    deadline = "2026-08-12",
                    status = "pending",
                    members = emptyList(),
                ),
            ),
        )
        assertEquals(document, focusedAdminDocument(listOf(document), "doc-2"))
        assertEquals(document, focusedAdminDocument(listOf(document), "asg-9"))
        assertNull(focusedAdminDocument(listOf(document), "other"))
    }
}
