package lvt.crm.ui.work

import lvt.crm.data.work.WorkApprovalItem
import lvt.crm.data.work.WorkCompletionReviewItem
import lvt.crm.data.work.WorkDocumentAssignment
import org.junit.Assert.assertEquals
import org.junit.Test

class AdminDocumentFilterTest {
    @Test
    fun selectionAndNotificationFocusResolveAgainstLatestDocuments() {
        val stale = document("document-1", "work-1")
        val updated = stale.copy(content = "updated")

        assertEquals("updated", currentAdminDocument(listOf(updated), stale.id)?.content)
        assertEquals(updated.id, focusedAdminDocument(listOf(updated), "work-1")?.id)
    }

    @Test
    fun pendingCompletionFilterKeepsOnlyDocumentsWithReviewableTasks() {
        val reviewable = document("reviewable", "work-1")
        val complete = document("complete", "work-2")
        val reviews = listOf(
            WorkCompletionReviewItem(
                workItemId = "work-1",
                userId = "user-1",
                userName = "Giáo viên tổ Toán",
                content = "Soạn giáo án",
                deadline = "2026-07-30",
                departmentName = "Tổ Toán",
            ),
        )

        assertEquals(
            listOf("reviewable"),
            visibleAdminDocuments(
                listOf(reviewable, complete),
                reviews,
                AdminDocumentFilter.PendingCompletion,
            ).map { it.id },
        )
    }

    private fun document(id: String, workItemId: String) = WorkApprovalItem(
        id = id,
        fileName = "$id.pdf",
        content = id,
        deadline = "2026-07-30",
        status = "approved",
        approvalCount = 1,
        approvalTotal = 1,
        myDecision = "",
        assignments = listOf(
            WorkDocumentAssignment(
                id = workItemId,
                departmentName = "Tổ Toán",
                content = "Soạn giáo án",
                deadline = "2026-07-30",
                status = "pending_completion",
                members = emptyList(),
            ),
        ),
    )
}
