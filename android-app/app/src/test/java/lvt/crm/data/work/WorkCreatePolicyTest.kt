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
}
