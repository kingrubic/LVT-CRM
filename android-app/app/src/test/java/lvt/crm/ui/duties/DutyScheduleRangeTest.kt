package lvt.crm.ui.duties

import org.junit.Assert.assertEquals
import org.junit.Test

class DutyScheduleRangeTest {
    @Test
    fun weekRangeMatchesWebMondayToSaturday() {
        val range = scheduleRange("week", "2026-09-11")
        assertEquals("2026-09-07", range.startIso)
        assertEquals("2026-09-12", range.endIso)
        assertEquals("LỊCH CÔNG TÁC TỪ NGÀY 07/9/2026 ĐẾN 12/9/2026", range.title)
        assertEquals("LCT tu 07.9-12.9.pdf", range.filename)
        assertEquals("07/9/2026 – 12/9/2026", range.shortLabel)
    }

    @Test
    fun monthRangeUsesWholeCalendarMonth() {
        val range = scheduleRange("month", "2026-09-11")
        assertEquals("2026-09-01", range.startIso)
        assertEquals("2026-09-30", range.endIso)
    }

    @Test
    fun shiftMovesWeekAndMonth() {
        assertEquals("2026-09-14", shiftScheduleAnchor("week", "2026-09-11", 1))
        assertEquals("2026-08-31", shiftScheduleAnchor("week", "2026-09-11", -1))
        assertEquals("2026-10-01", shiftScheduleAnchor("month", "2026-09-11", 1))
        assertEquals("2026-08-01", shiftScheduleAnchor("month", "2026-09-11", -1))
    }
}
