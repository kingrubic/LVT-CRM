package lvt.crm.data.chat

import lvt.crm.data.work.WorkApprovalItem
import lvt.crm.data.work.WorkDocumentAssignment
import lvt.crm.data.work.WorkTaskItem
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ChatFormattingTest {
    @Test
    fun htmlRoundTripKeepsBoldItalicUnderlineAndLineBreaks() {
        val text = "Xin chào\nthế giới"
        val flags = IntArray(text.length)
        flags[0] = CHAT_BOLD
        flags[1] = CHAT_BOLD
        flags[4] = CHAT_ITALIC or CHAT_UNDERLINE
        val html = chatTextToHtml(text, flags)
        assertEquals("<b>Xi</b>n <i><u>c</u></i>hào<br>thế giới", html)
        val runs = chatHtmlToRuns(html)
        assertEquals(text, runs.joinToString("") { it.text })
        assertTrue(runs.first { it.text.startsWith("Xi") }.bold)
        assertTrue(runs.first { it.text == "c" }.italic)
        assertTrue(runs.first { it.text == "c" }.underline)
    }

    @Test
    fun htmlDisplayRendersWebListsAndEscapes() {
        val runs = chatHtmlToRuns("<ul><li>Một</li><li><b>Hai</b></li></ul><p>a&lt;b</p>")
        val text = runs.joinToString("") { it.text }
        assertEquals("• Một\n• Hai\na<b", text)
        assertTrue(runs.first { it.text == "Hai" }.bold)
    }

    @Test
    fun numberedListUsesOrder() {
        val text = chatHtmlToRuns("<ol><li>A</li><li>B</li></ol>").joinToString("") { it.text }
        assertEquals("1. A\n2. B", text)
    }

    @Test
    fun recallWindowMatchesFifteenMinutes() {
        val created = 1_000_000L
        assertTrue(chatRecallStillOpen(created, recalled = false, now = created + CHAT_RECALL_WINDOW_MS))
        assertFalse(chatRecallStillOpen(created, recalled = false, now = created + CHAT_RECALL_WINDOW_MS + 1))
        assertFalse(chatRecallStillOpen(created, recalled = true, now = created))
    }

    @Test
    fun editKeepsStylesAroundAnInsertion() {
        val flags = chatApplyEdit("ab", intArrayOf(CHAT_BOLD, 0), "axb", CHAT_ITALIC)
        assertEquals(3, flags.size)
        assertEquals(CHAT_BOLD, flags[0])
        assertEquals(CHAT_ITALIC, flags[1])
        assertEquals(0, flags[2])
    }

    @Test
    fun toggleFlagClearsWhenTheWholeSelectionIsAlreadySet() {
        val toggled = chatToggleFlag(intArrayOf(CHAT_BOLD, CHAT_BOLD), 0, 2, CHAT_BOLD)
        assertEquals(0, toggled[0])
        assertEquals(0, toggled[1])
    }

    @Test
    fun failureMessagesMatchWebCopy() {
        assertEquals(
            "Vui lòng nhập nội dung tin nhắn.",
            chatFailureMessage("DUTY_CHAT_EMPTY", ChatAction.Send),
        )
        assertEquals(
            "Tin nhắn quá dài (tối đa 4000 ký tự).",
            chatFailureMessage("WORK_CHAT_TOO_LONG", ChatAction.Send),
        )
        assertEquals(
            "Đã quá 15 phút, không thể thu hồi tin nhắn này.",
            chatFailureMessage("DUTY_CHAT_RECALL_TOO_LATE", ChatAction.Recall),
        )
        assertEquals(
            "Bạn chỉ có thể thu hồi tin nhắn của mình.",
            chatFailureMessage("WORK_CHAT_RECALL_FORBIDDEN", ChatAction.Recall),
        )
        assertEquals(
            "Bạn không có quyền trao đổi mục này.",
            chatFailureMessage("DUTY_CHAT_FORBIDDEN", ChatAction.Load),
        )
    }

    @Test
    fun workChatTargetPrefersDocumentId() {
        val task = WorkTaskItem(
            id = "task-1",
            kind = WorkTaskItem.Kind.WorkItem,
            title = "Việc A",
            deadline = "2026-09-01",
            status = "pending",
            documentContent = "",
            departmentName = "P1",
            qualityPercent = null,
            rejectionReason = "",
            isAdmin = false,
            documentTitle = "Kế hoạch",
            documentId = "doc-9",
        )
        val approval = WorkApprovalItem(
            id = "doc-2",
            fileName = "cv.pdf",
            content = "Nội dung",
            deadline = "2026-09-01",
            status = "pending",
            approvalCount = 0,
            approvalTotal = 1,
            myDecision = "",
            title = "Công văn",
            assignments = listOf(
                WorkDocumentAssignment("asg-1", "P1", "Việc", "2026-09-01", "pending", emptyList()),
            ),
        )
        assertEquals("doc-9", workChatTarget("doc-9", listOf(task), emptyList()).entityId)
        assertEquals("Kế hoạch", workChatTarget("task-1", listOf(task), emptyList()).title)
        assertEquals("doc-2", workChatTarget("doc-2", emptyList(), listOf(approval)).entityId)
        assertEquals("Công việc", workChatTarget("missing", emptyList(), emptyList()).title)
    }
}
