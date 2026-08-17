package lvt.crm.ui.duties

import lvt.crm.data.duties.DutyItem
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class DutyFilterTest {
    @Test
    fun upcomingTabKeepsOngoingAndUpcomingAndDropsEnded() {
        val upcoming = duty(id = "a", upcoming = true, startTime = "08:00")
        val later = duty(id = "b", upcoming = true, startTime = "10:00")
        val ended = duty(id = "c", overdue = true, endDate = "2026-08-01")
        assertEquals(listOf("a", "b"), filterDutiesByTab(listOf(later, ended, upcoming), DutyListTab.Upcoming).map { it.id })
        assertEquals(listOf("c"), filterDutiesByTab(listOf(later, ended, upcoming), DutyListTab.Past).map { it.id })
    }

    @Test
    fun splitPutsAssignedFirstAndCreatedSecond() {
        val mineOnly = duty(id = "a", isMine = true, createdBy = "boss")
        val createdOnly = duty(id = "b", isMine = false, createdBy = "me")
        val both = duty(id = "c", isMine = true, createdBy = "me")
        val leftover = duty(id = "d", isMine = false, createdBy = "other")
        val split = splitDutyLists(listOf(mineOnly, createdOnly, both, leftover), "me")
        assertEquals(listOf("a", "c"), split.mine.map { it.id })
        assertEquals(listOf("b", "c"), split.created.map { it.id })
        val admin = splitDutyLists(
            listOf(mineOnly, createdOnly, both, leftover),
            "me",
            includeManagedOthers = true,
        )
        assertEquals(listOf("b", "c", "d"), admin.created.map { it.id })
    }

    @Test
    fun visibleMineHonorsSelectedTab() {
        val duties = listOf(duty(id = "a", upcoming = true, isMine = true), duty(id = "b", overdue = true, isMine = true))
        val state = DutiesUiState(duties = duties, currentUserId = "me", mineTab = DutyListTab.Past)
        assertEquals(listOf("b"), state.visibleMine.map { it.id })
        assertFalse(state.showCreatedSection)
        assertTrue(dutyDisplayTitle(duty(title = "Đi thực tế", content = "Nội dung")).contains("Đi thực tế"))
    }

    private fun duty(
        id: String = "duty-1",
        upcoming: Boolean = false,
        ongoing: Boolean = false,
        overdue: Boolean = false,
        isMine: Boolean = true,
        createdBy: String = "me",
        title: String = "",
        content: String = "Họp",
        startTime: String = "08:00",
        endDate: String = "2026-08-09",
    ) = DutyItem(
        id = id,
        content = content,
        startDate = "2026-08-09",
        endDate = endDate,
        startTime = startTime,
        endTime = "09:00",
        allDay = false,
        locationNames = emptyList(),
        departmentNames = emptyList(),
        departmentParticipants = emptyList(),
        participantNames = emptyList(),
        myStatus = "pending",
        isMine = isMine,
        isOngoing = ongoing,
        isOverdue = overdue,
        isUpcoming = upcoming,
        canMarkAttendance = true,
        title = title,
        createdBy = createdBy,
    )
}
