package lvt.crm.ui.work

import lvt.crm.data.work.WorkApprovalItem
import org.junit.Assert.assertEquals
import org.junit.Test

class WorkApprovalOrderingTest {
    @Test
    fun pendingApprovalsAreSortedBeforeDecidedApprovals() {
        val approved = approval("approved", "2026-07-29", "approved")
        val pendingLater = approval("pending-later", "2026-07-31")
        val pendingSooner = approval("pending-sooner", "2026-07-30")

        val ordered = orderedWorkApprovals(listOf(approved, pendingLater, pendingSooner))

        assertEquals(
            listOf("pending-sooner", "pending-later", "approved"),
            ordered.map { it.id },
        )
    }

    @Test
    fun pendingFilterHidesDecidedApprovals() {
        val pending = approval("pending", "2026-07-30")
        val approved = approval("approved", "2026-07-29", "approved")
        val rejected = approval("rejected", "2026-07-29", "rejected")

        assertEquals(
            listOf(pending),
            visibleWorkApprovals(listOf(pending, approved, rejected), pendingOnly = true),
        )
    }

    private fun approval(
        id: String,
        deadline: String,
        decision: String = "",
    ) = WorkApprovalItem(
        id = id,
        fileName = "$id.pdf",
        content = id,
        deadline = deadline,
        status = "pending_approval",
        approvalCount = if (decision == "approved") 1 else 0,
        approvalTotal = 1,
        myDecision = decision,
    )
}
