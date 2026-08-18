package lvt.crm.ui.duties

import lvt.crm.data.duties.DutyItem
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class DutyFilterTest {
    @Test
    fun tabsMatchDashboardUpcomingOngoingAndPast() {
        val upcoming = duty(id = "a", upcoming = true, startTime = "08:00")
        val later = duty(id = "b", upcoming = true, startTime = "10:00")
        val ongoing = duty(id = "now", ongoing = true, startTime = "09:00")
        val ended = duty(id = "c", overdue = true, endDate = "2026-08-01")
        val list = listOf(later, ended, ongoing, upcoming)
        assertEquals(listOf("a", "b"), filterDutiesByTab(list, DutyListTab.Upcoming).map { it.id })
        assertEquals(listOf("now"), filterDutiesByTab(list, DutyListTab.Ongoing).map { it.id })
        assertEquals(listOf("c"), filterDutiesByTab(list, DutyListTab.Past).map { it.id })
        assertEquals(DutyListTab.Upcoming, tabForDuty(upcoming))
        assertEquals(DutyListTab.Ongoing, tabForDuty(ongoing))
        assertEquals(DutyListTab.Past, tabForDuty(ended))
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
        val duties = listOf(
            duty(id = "a", upcoming = true, isMine = true, createdBy = "boss"),
            duty(id = "now", ongoing = true, isMine = true, createdBy = "boss"),
            duty(id = "b", overdue = true, isMine = true, createdBy = "boss"),
        )
        val past = DutiesUiState(duties = duties, currentUserId = "me", mineTab = DutyListTab.Past)
        val ongoing = DutiesUiState(duties = duties, currentUserId = "me", mineTab = DutyListTab.Ongoing)
        val upcoming = DutiesUiState(duties = duties, currentUserId = "me", mineTab = DutyListTab.Upcoming)
        assertEquals(listOf("b"), past.visibleMine.map { it.id })
        assertEquals(listOf("now"), ongoing.visibleMine.map { it.id })
        assertEquals(listOf("a"), upcoming.visibleMine.map { it.id })
        assertFalse(past.showCreatedSection)
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
