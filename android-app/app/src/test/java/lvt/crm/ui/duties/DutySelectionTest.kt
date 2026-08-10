package lvt.crm.ui.duties

import lvt.crm.data.duties.DutyItem
import org.junit.Assert.assertEquals
import org.junit.Test

class DutySelectionTest {
    @Test
    fun selectedDutyResolvesFromLatestSnapshot() {
        val stale = duty(status = "pending", canMarkAttendance = true)
        val updated = duty(status = "attended", canMarkAttendance = false)

        assertEquals(stale, currentDuty(listOf(stale), "duty-1"))
        assertEquals(updated, currentDuty(listOf(updated), "duty-1"))
    }

    private fun duty(status: String, canMarkAttendance: Boolean) = DutyItem(
        id = "duty-1",
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
        myStatus = status,
        isMine = true,
        isOngoing = true,
        isOverdue = false,
        isUpcoming = false,
        canMarkAttendance = canMarkAttendance,
    )
}
