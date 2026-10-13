package lvt.crm.ui.homeroom

import lvt.crm.data.homeroom.AttendanceCounts
import lvt.crm.data.homeroom.HomeroomClassSummary
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class HomeroomPresentationTest {
    private fun counts(present: Int = 0, late: Int = 0, absent: Int = 0, noData: Int = 0, exempt: Int = 0) =
        AttendanceCounts(present = present, late = late, absentExcused = 0, absentUnexcused = 0, absentPending = absent, noData = noData, exempt = exempt)

    private fun klass(counts: AttendanceCounts, published: Boolean = true, pending: Int = 0, teacher: String = "Lê Thị Cúc", name: String = "Lớp 6-2") =
        HomeroomClassSummary("c1", "2627-6-2", name, 6, 41, teacher, published, counts, pending, true)

    @Test
    fun classRowsUseShortTitleAndOneLineSubtitle() {
        val row = klass(counts(present = 41))
        assertEquals("Lớp 6-2", HomeroomPresentation.classTitle(row))
        assertEquals("41 HS · Lê Thị Cúc", HomeroomPresentation.classSubtitle(row))
        assertEquals("Lớp 2627-6-2", HomeroomPresentation.classTitle(klass(counts(), name = "")))
        assertEquals("41 HS · Chưa có GVCN", HomeroomPresentation.classSubtitle(klass(counts(), teacher = "")))
    }

    @Test
    fun classChipsShowOneMainStatusPlusPending() {
        assertEquals(listOf(HomeroomChip("Đủ 41/41", HomeroomTone.Success)), HomeroomPresentation.classChips(klass(counts(present = 41)), true))
        assertEquals(
            listOf(HomeroomChip("3 vắng", HomeroomTone.Danger), HomeroomChip("2 chờ", HomeroomTone.Warning)),
            HomeroomPresentation.classChips(klass(counts(present = 37, late = 1, absent = 3), pending = 2), true),
        )
        assertEquals(listOf(HomeroomChip("1 trễ", HomeroomTone.Warning)), HomeroomPresentation.classChips(klass(counts(present = 40, late = 1)), true))
        assertEquals(listOf(HomeroomChip("Chưa điểm danh", HomeroomTone.Neutral)), HomeroomPresentation.classChips(klass(counts(), published = false), true))
    }

    @Test
    fun noChipsOnDaysWithoutAttendance() {
        assertTrue(HomeroomPresentation.classChips(klass(counts(), published = false), false).isEmpty())
    }

    @Test
    fun studentChipCollapsesEveryAbsenceToVang() {
        for (status in listOf("absent_pending", "absent_excused", "absent_unexcused")) {
            assertEquals(HomeroomChip("Vắng", HomeroomTone.Danger), HomeroomPresentation.studentChip(status, null))
        }
        assertEquals(HomeroomChip("Trễ 07:12", HomeroomTone.Warning), HomeroomPresentation.studentChip("late", "07:12"))
        assertEquals(HomeroomChip("Có mặt", HomeroomTone.Success), HomeroomPresentation.studentChip("present", "06:55"))
        assertEquals(HomeroomChip("Chưa có", HomeroomTone.Neutral), HomeroomPresentation.studentChip("no_data", null))
    }

    @Test
    fun statsAndSummaryUseVietnameseFormatting() {
        val stats = HomeroomPresentation.overviewStats(counts(present = 2301, late = 18, absent = 12, noData = 7))
        assertEquals(listOf("2.301", "18", "12", "7"), stats.map { it.value })
        assertEquals(listOf("Có mặt", "Trễ", "Vắng", "Chưa có"), stats.map { it.label })
        assertEquals("Chuyên cần 98,4% · 50 lớp · 2.338 học sinh", HomeroomPresentation.overviewSummary(2338, 50, 0.984, 10))
        assertEquals("50 lớp · 2.338 học sinh", HomeroomPresentation.overviewSummary(2338, 50, 0.0, 0))
        assertEquals(3, HomeroomPresentation.dailyStats(listOf("present", "late", "absent_pending")).size)
        assertEquals("Chưa có", HomeroomPresentation.dailyStats(listOf("present", "no_data")).last().label)
    }

    @Test
    fun dayTitleAndNavigation() {
        assertEquals("Thứ Sáu, 09/10", HomeroomPresentation.dayTitle("2026-10-09"))
        assertEquals("Chủ Nhật, 11/10", HomeroomPresentation.dayTitle("2026-10-11"))
        assertEquals("2026-10-10", HomeroomPresentation.shiftDay("2026-10-09", 1))
        assertEquals("2026-09-30", HomeroomPresentation.shiftDay("2026-10-01", -1))
        assertEquals("not-a-date", HomeroomPresentation.dayTitle("not-a-date"))
    }
}
