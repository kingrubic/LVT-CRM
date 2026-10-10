package lvt.crm.ui.homeroom

import java.text.NumberFormat
import java.time.DayOfWeek
import java.time.LocalDate
import java.util.Locale
import lvt.crm.data.homeroom.AttendanceCounts
import lvt.crm.data.homeroom.HomeroomClassSummary

/** Visual meaning of a chip or stat tile; mapped to DESIGN.md status colors in the UI layer. */
enum class HomeroomTone { Success, Warning, Danger, Neutral, Info }

data class HomeroomChip(val text: String, val tone: HomeroomTone)

data class HomeroomStat(val value: String, val label: String, val tone: HomeroomTone)

/** Teacher-facing wording and status summaries for Lớp chủ nhiệm. Pure Kotlin so it is unit-testable. */
object HomeroomPresentation {
    private val vietnamese = Locale.forLanguageTag("vi-VN")
    private val absentStatuses = setOf("absent_pending", "absent_excused", "absent_unexcused")

    fun number(value: Int): String = NumberFormat.getIntegerInstance(vietnamese).format(value)

    fun classTitle(row: HomeroomClassSummary): String = row.name.ifBlank { "Lớp ${row.code}" }

    fun classSubtitle(row: HomeroomClassSummary): String =
        "${row.rosterCount} HS · ${row.teacherName.ifBlank { "Chưa có GVCN" }}"

    /** One main status chip plus a pending chip; no chips on days that need no attendance. */
    fun classChips(row: HomeroomClassSummary, schoolDay: Boolean): List<HomeroomChip> {
        if (!schoolDay) return emptyList()
        if (!row.published) return listOf(HomeroomChip("Chưa điểm danh", HomeroomTone.Neutral))
        val counts = row.counts
        val main = when {
            counts.absent > 0 -> HomeroomChip("${counts.absent} vắng", HomeroomTone.Danger)
            counts.late > 0 -> HomeroomChip("${counts.late} trễ", HomeroomTone.Warning)
            counts.noData > 0 -> HomeroomChip("${counts.noData} chưa có", HomeroomTone.Neutral)
            else -> HomeroomChip("Đủ ${counts.present + counts.exempt}/${row.rosterCount}", HomeroomTone.Success)
        }
        return if (row.pendingTotal > 0) listOf(main, HomeroomChip("${row.pendingTotal} chờ", HomeroomTone.Warning)) else listOf(main)
    }

    fun overviewStats(counts: AttendanceCounts): List<HomeroomStat> = listOf(
        HomeroomStat(number(counts.present), "Có mặt", HomeroomTone.Success),
        HomeroomStat(number(counts.late), "Trễ", HomeroomTone.Warning),
        HomeroomStat(number(counts.absent), "Vắng", HomeroomTone.Danger),
        HomeroomStat(number(counts.noData), "Chưa có", HomeroomTone.Neutral),
    )

    fun overviewSummary(studentCount: Int, classCount: Int, attendanceRate: Double, ratedRows: Int): String {
        val base = "${number(classCount)} lớp · ${number(studentCount)} học sinh"
        if (ratedRows <= 0) return base
        val rate = String.format(vietnamese, "%.1f", attendanceRate * 100)
        return "Chuyên cần $rate% · $base"
    }

    /** "Thứ Sáu, 09/10" for an ISO date; falls back to the raw value when it does not parse. */
    fun dayTitle(isoDate: String): String = runCatching {
        val date = LocalDate.parse(isoDate)
        val weekday = when (date.dayOfWeek) {
            DayOfWeek.MONDAY -> "Thứ Hai"
            DayOfWeek.TUESDAY -> "Thứ Ba"
            DayOfWeek.WEDNESDAY -> "Thứ Tư"
            DayOfWeek.THURSDAY -> "Thứ Năm"
            DayOfWeek.FRIDAY -> "Thứ Sáu"
            DayOfWeek.SATURDAY -> "Thứ Bảy"
            else -> "Chủ Nhật"
        }
        "%s, %02d/%02d".format(weekday, date.dayOfMonth, date.monthValue)
    }.getOrDefault(isoDate)

    fun shiftDay(isoDate: String, days: Long): String =
        runCatching { LocalDate.parse(isoDate).plusDays(days).toString() }.getOrDefault(isoDate)

    fun studentChip(status: String, observedTime: String?): HomeroomChip = when {
        status == "present" -> HomeroomChip("Có mặt", HomeroomTone.Success)
        status == "late" -> HomeroomChip(observedTime?.let { "Trễ $it" } ?: "Trễ", HomeroomTone.Warning)
        status in absentStatuses -> HomeroomChip("Vắng", HomeroomTone.Danger)
        status == "exempt" -> HomeroomChip("Miễn", HomeroomTone.Info)
        else -> HomeroomChip("Chưa có", HomeroomTone.Neutral)
    }

    /** Có mặt / Trễ / Vắng tiles for a class day; adds Chưa có only when some rows have no data. */
    fun dailyStats(statuses: List<String>): List<HomeroomStat> {
        val noData = statuses.count { it == "no_data" }
        val tiles = listOf(
            HomeroomStat(number(statuses.count { it == "present" }), "Có mặt", HomeroomTone.Success),
            HomeroomStat(number(statuses.count { it == "late" }), "Trễ", HomeroomTone.Warning),
            HomeroomStat(number(statuses.count { it in absentStatuses }), "Vắng", HomeroomTone.Danger),
        )
        return if (noData > 0) tiles + HomeroomStat(number(noData), "Chưa có", HomeroomTone.Neutral) else tiles
    }
}
