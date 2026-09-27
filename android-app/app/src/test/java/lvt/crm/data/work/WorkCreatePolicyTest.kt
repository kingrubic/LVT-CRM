package lvt.crm.data.work

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class WorkCreatePolicyTest {
    @Test
    fun opsAndTeamLeadsCanCreate() {
        assertTrue(WorkCreatePolicy.canCreate("admin", 1))
        assertTrue(WorkCreatePolicy.canCreate("moderator", 5))
        assertTrue(WorkCreatePolicy.canCreate("user", 2))
        assertTrue(WorkCreatePolicy.canCreate("user", 3))
        assertFalse(WorkCreatePolicy.canCreate("user", 1))
        assertFalse(WorkCreatePolicy.canCreate("user", 4))
        assertFalse(WorkCreatePolicy.canCreate("user", 5))
    }

    @Test
    fun validateRequiresTitleAssignmentsAndDeadline() {
        assertEquals(
            "Vui lòng nhập tên công việc (tối đa 200 ký tự).",
            WorkCreatePolicy.validate("  ", emptyList()),
        )
        assertEquals(
            "Vui lòng thêm ít nhất một phân công.",
            WorkCreatePolicy.validate("Họp tổ", emptyList()),
        )
        assertEquals(
            "Phân công 1: chọn người nhận.",
            WorkCreatePolicy.validate(
                "Họp tổ",
                listOf(WorkCreateAssignment(type = "individual", content = "Làm báo cáo", deadline = "2026-09-01")),
            ),
        )
        assertEquals(
            "Phân công 1: chọn phòng ban.",
            WorkCreatePolicy.validate(
                "Họp tổ",
                listOf(WorkCreateAssignment(type = "department", content = "Làm báo cáo", deadline = "2026-09-01")),
            ),
        )
        assertEquals(
            "Phân công 1: chọn hạn chót.",
            WorkCreatePolicy.validate(
                "Họp tổ",
                listOf(
                    WorkCreateAssignment(
                        type = "individual",
                        userIds = listOf("user-1"),
                        content = "Làm báo cáo",
                    ),
                ),
            ),
        )
        assertNull(
            WorkCreatePolicy.validate(
                "Họp tổ",
                listOf(
                    WorkCreateAssignment(
                        type = "individual",
                        userIds = listOf("user-1"),
                        content = "Làm báo cáo",
                        deadline = "2026-09-01",
                    ),
                ),
            ),
        )
    }

    @Test
    fun validateRequiresDocumentTypeWhenFileAttached() {
        val assignment = WorkCreateAssignment(
            type = "individual",
            userIds = listOf("user-1"),
            content = "Làm báo cáo",
            deadline = "2026-09-01",
        )
        assertEquals(
            "Vui lòng chọn loại văn bản.",
            WorkCreatePolicy.validate("Họp tổ", listOf(assignment), hasFile = true),
        )
        assertNull(
            WorkCreatePolicy.validate(
                "Họp tổ",
                listOf(assignment),
                hasFile = true,
                documentTypeId = "type-1",
            ),
        )
        assertNull(WorkCreatePolicy.validate("Họp tổ", listOf(assignment), hasFile = false))
    }

    @Test
    fun editStaysOpenForOpsAfterSubmissionLock() {
        assertTrue(WorkDocumentActions.showsEdit(canEdit = false, isOps = true))
        assertTrue(WorkDocumentActions.showsDelete(canDelete = false, isOps = true))
        assertFalse(WorkDocumentActions.showsLocked(canEdit = false, canDelete = false, isOps = true))
        assertFalse(WorkDocumentActions.showsEdit(canEdit = false, isOps = false))
        assertTrue(WorkDocumentActions.showsLocked(canEdit = false, canDelete = false, isOps = false))
        assertEquals(
            WORK_LOCKED_MESSAGE,
            WorkDocumentActions.errorMessage("Error: WORK_DOCUMENT_IMMUTABLE", deleting = true, fallback = "x"),
        )
        assertEquals(
            "Bạn không có quyền sửa hoặc xóa công việc này.",
            WorkDocumentActions.errorMessage("WORK_UPDATE_FORBIDDEN", deleting = false, fallback = "x"),
        )
        assertEquals(
            "Không thể xóa công văn lúc này.",
            WorkDocumentActions.errorMessage("WORK_DOCUMENT_NOT_FOUND", deleting = true, fallback = "x"),
        )
    }

    @Test
    fun editAssignmentsSplitIndividualMembers() {
        val document = WorkApprovalItem(
            id = "doc-1",
            fileName = "bao-cao.pdf",
            content = "Nội dung",
            deadline = "2026-09-01",
            status = "approved",
            approvalCount = 0,
            approvalTotal = 0,
            myDecision = "",
            assignments = listOf(
                WorkDocumentAssignment(
                    id = "item-1",
                    departmentName = "Cá nhân",
                    content = "Làm báo cáo",
                    deadline = "2026-09-01",
                    status = "in_progress",
                    members = listOf(
                        WorkMemberItem("user-1", "An", "pending_task"),
                        WorkMemberItem("user-2", "Bình", "pending_task"),
                    ),
                    type = "individual",
                ),
                WorkDocumentAssignment(
                    id = "item-2",
                    departmentName = "Văn phòng",
                    content = "Họp",
                    deadline = "2026-09-02",
                    status = "in_progress",
                    members = listOf(WorkMemberItem("user-3", "Chi", "pending_task")),
                    type = "department",
                    departmentId = "dept-1",
                ),
            ),
            canEdit = true,
            canDelete = true,
        )
        val rows = document.editAssignments()
        assertEquals(3, rows.size)
        assertEquals(listOf("user-1"), rows[0].userIds)
        assertEquals(listOf("user-2"), rows[1].userIds)
        assertEquals("dept-1", rows[2].departmentId)
        assertEquals("Họp", rows[2].content)
    }
}
