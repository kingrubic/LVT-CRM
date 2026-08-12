package lvt.crm.ui.duties

import lvt.crm.data.duties.DutyItem
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class DutyFilterTest {
    @Test
    fun filterMatchesIosCategories() {
        val upcoming = duty(upcoming = true)
        val ongoing = duty(ongoing = true)
        val ended = duty(overdue = true)
        assertTrue(DutyFilter.All.includes(upcoming))
        assertTrue(DutyFilter.Upcoming.includes(upcoming))
        assertFalse(DutyFilter.Upcoming.includes(ongoing))
        assertTrue(DutyFilter.Ongoing.includes(ongoing))
        assertTrue(DutyFilter.Ended.includes(ended))
        assertFalse(DutyFilter.Ended.includes(upcoming))
    }

    @Test
    fun visibleDutiesHonorSelectedFilter() {
        val duties = listOf(duty(id = "a", upcoming = true), duty(id = "b", ongoing = true))
        val state = DutiesUiState(duties = duties, filter = DutyFilter.Ongoing)
        assertEquals(listOf("b"), state.visibleDuties.map { it.id })
    }

    private fun duty(
        id: String = "duty-1",
        upcoming: Boolean = false,
        ongoing: Boolean = false,
        overdue: Boolean = false,
    ) = DutyItem(
        id = id,
        content = "Họp",
        startDate = "2026-08-09",
        endDate = "2026-08-09",
        startTime = "08:00",
        endTime = "09:00",
        allDay = false,
        locationNames = emptyList(),
        departmentNames = emptyList(),
        departmentParticipants = emptyList(),
        participantNames = emptyList(),
        myStatus = "pending",
        isMine = true,
        isOngoing = ongoing,
        isOverdue = overdue,
        isUpcoming = upcoming,
        canMarkAttendance = true,
    )
}
