package lvt.crm.ui.duties

import java.util.Calendar

data class DutyScheduleRange(
    val mode: String,
    val startIso: String,
    val endIso: String,
    val title: String,
) {
    val filename: String
        get() = "LCT tu ${formatDayMonth(startIso).replace("/", ".")}-${formatDayMonth(endIso).replace("/", ".")}.pdf"

    val shortLabel: String
        get() = "${formatVnDate(startIso)} – ${formatVnDate(endIso)}"
}

fun todayIsoDate(calendar: Calendar = Calendar.getInstance()): String = toIsoDate(calendar)

fun scheduleRange(mode: String, anchorIso: String): DutyScheduleRange {
    val anchor = fromIsoDate(anchorIso)
    if (mode == "month") {
        val start = anchor.clone() as Calendar
        start.set(Calendar.DAY_OF_MONTH, 1)
        val end = start.clone() as Calendar
        end.set(Calendar.DAY_OF_MONTH, end.getActualMaximum(Calendar.DAY_OF_MONTH))
        val startIso = toIsoDate(start)
        val endIso = toIsoDate(end)
        return DutyScheduleRange(
            mode = "month",
            startIso = startIso,
            endIso = endIso,
            title = "LỊCH CÔNG TÁC TỪ NGÀY ${formatVnDate(startIso)} ĐẾN ${formatVnDate(endIso)}",
        )
    }
    val start = startOfWeekMonday(anchor)
    val end = start.clone() as Calendar
    end.add(Calendar.DAY_OF_MONTH, 5)
    val startIso = toIsoDate(start)
    val endIso = toIsoDate(end)
    return DutyScheduleRange(
        mode = "week",
        startIso = startIso,
        endIso = endIso,
        title = "LỊCH CÔNG TÁC TỪ NGÀY ${formatVnDate(startIso)} ĐẾN ${formatVnDate(endIso)}",
    )
}

fun shiftScheduleAnchor(mode: String, anchorIso: String, direction: Int): String {
    val anchor = fromIsoDate(anchorIso)
    if (mode == "month") {
        anchor.set(Calendar.DAY_OF_MONTH, 1)
        anchor.add(Calendar.MONTH, direction)
        return toIsoDate(anchor)
    }
    val start = startOfWeekMonday(anchor)
    start.add(Calendar.DAY_OF_MONTH, direction * 7)
    return toIsoDate(start)
}

private fun startOfWeekMonday(date: Calendar): Calendar {
    val start = date.clone() as Calendar
    val day = start.get(Calendar.DAY_OF_WEEK)
    val delta = if (day == Calendar.SUNDAY) -6 else Calendar.MONDAY - day
    start.add(Calendar.DAY_OF_MONTH, delta)
    return start
}

private fun fromIsoDate(value: String): Calendar {
    val parts = value.split("-").map { it.toInt() }
    return Calendar.getInstance().apply {
        clear()
        set(parts[0], parts[1] - 1, parts[2])
    }
}

private fun toIsoDate(date: Calendar): String {
    val year = date.get(Calendar.YEAR)
    val month = date.get(Calendar.MONTH) + 1
    val day = date.get(Calendar.DAY_OF_MONTH)
    return "%04d-%02d-%02d".format(year, month, day)
}

private fun formatDayMonth(isoDate: String): String {
    val parts = isoDate.split("-")
    if (parts.size != 3) return ""
    return "${parts[2]}/${parts[1].toInt()}"
}

private fun formatVnDate(isoDate: String): String {
    val parts = isoDate.split("-")
    if (parts.size != 3) return ""
    return "${parts[2]}/${parts[1].toInt()}/${parts[0]}"
}
