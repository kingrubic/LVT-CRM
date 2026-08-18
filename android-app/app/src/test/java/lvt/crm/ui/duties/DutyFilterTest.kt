package lvt.crm.ui.duties

import lvt.crm.data.duties.DutyItem
import lvt.crm.ui.components.ListSearchState
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

    @Test
    fun searchMatchesTitleContentAndAdvancedFiltersWithoutDiacritics() {
        val meeting = duty(
            id = "a",
            title = "Họp khối chuyên môn",
            content = "Làm việc với UBND",
            departmentNames = listOf("Phòng Giáo viên"),
            participantNames = listOf("Trần Anh Vũ"),
            locationText = "Phòng họp A",
            startDate = "2026-08-18",
            endDate = "2026-08-18",
        )
        val trip = duty(
            id = "b",
            title = "Đi thực tế",
            content = "Tham quan trường bạn",
            departmentNames = listOf("Phòng Tổ chức"),
            participantNames = listOf("Admin"),
            locationNames = listOf("Sân trường"),
            startDate = "2026-08-20",
            endDate = "2026-08-21",
        )
        val list = listOf(meeting, trip)
        assertEquals(listOf("a"), filterDutiesBySearch(list, ListSearchState(query = "hop khoi")).map { it.id })
        assertEquals(listOf("a"), filterDutiesBySearch(list, ListSearchState(query = "UBND")).map { it.id })
        assertEquals(listOf("b"), filterDutiesBySearch(list, ListSearchState(query = "thực tế")).map { it.id })
        assertEquals(listOf("a"), filterDutiesBySearch(list, ListSearchState(department = "giao vien")).map { it.id })
        assertEquals(listOf("a"), filterDutiesBySearch(list, ListSearchState(person = "anh vu")).map { it.id })
        assertEquals(listOf("b"), filterDutiesBySearch(list, ListSearchState(location = "san truong")).map { it.id })
        assertEquals(
            listOf("b"),
            filterDutiesBySearch(list, ListSearchState(dateFrom = "2026-08-20", dateTo = "2026-08-20")).map { it.id },
        )
        assertEquals(
            emptyList<String>(),
            filterDutiesBySearch(list, ListSearchState(query = "hop", department = "to chuc")).map { it.id },
        )
        val filtered = DutiesUiState(
            duties = listOf(meeting.copy(isMine = true, isUpcoming = true)),
            currentUserId = "me",
            search = ListSearchState(query = "khong co"),
        )
        assertTrue(filtered.mineSearchEmpty)
        assertTrue(filtered.visibleMine.isEmpty())
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
        startDate: String = "2026-08-09",
        endDate: String = "2026-08-09",
        departmentNames: List<String> = emptyList(),
        participantNames: List<String> = emptyList(),
        locationNames: List<String> = emptyList(),
        locationText: String = "",
    ) = DutyItem(
        id = id,
        content = content,
        startDate = startDate,
        endDate = endDate,
        startTime = startTime,
        endTime = "09:00",
        allDay = false,
        locationNames = locationNames,
        departmentNames = departmentNames,
        departmentParticipants = emptyList(),
        participantNames = participantNames,
        myStatus = "pending",
        isMine = isMine,
        isOngoing = ongoing,
        isOverdue = overdue,
        isUpcoming = upcoming,
        canMarkAttendance = true,
        title = title,
        createdBy = createdBy,
        locationText = locationText,
    )
}
