package lvt.crm.data.work

import org.junit.Assert.assertEquals
import org.junit.Test

class WorkApprovalDecisionTest {
    @Test
    fun anotherApproversDecisionIsNotReportedAsMine() {
        val decisions = listOf(
            ApprovalDecision("other", approved = true, rejected = false),
            ApprovalDecision("me", approved = false, rejected = false),
        )

        assertEquals("", decisionForUser("me", decisions))
        assertEquals("approved", decisionForUser("other", decisions))
    }
}
