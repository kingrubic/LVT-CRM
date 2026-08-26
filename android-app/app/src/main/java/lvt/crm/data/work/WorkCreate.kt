package lvt.crm.data.work

data class WorkFormDepartment(
    val id: String,
    val name: String,
)

data class WorkFormUser(
    val id: String,
    val name: String,
    val departmentName: String,
    val level: Int,
)

data class WorkFormOptions(
    val canCreate: Boolean,
    val isOps: Boolean,
    val departments: List<WorkFormDepartment>,
    val users: List<WorkFormUser>,
)

data class WorkCreateAssignment(
    val type: String,
    val departmentId: String = "",
    val userIds: List<String> = emptyList(),
    val content: String = "",
    val deadline: String = "",
) {
    val isIndividual: Boolean get() = type == "individual"
}

fun formatWorkDeadline(millis: Long): String {
    val cal = java.util.Calendar.getInstance(java.util.TimeZone.getTimeZone("GMT+7"))
    cal.timeInMillis = millis
    return String.format(
        "%04d-%02d-%02d",
        cal.get(java.util.Calendar.YEAR),
        cal.get(java.util.Calendar.MONTH) + 1,
        cal.get(java.util.Calendar.DAY_OF_MONTH),
    )
}

object WorkCreatePolicy {
    fun canCreate(role: String, level: Int): Boolean {
        if (role == "admin" || role == "moderator") return true
        return level == 2 || level == 3
    }

    fun validate(title: String, assignments: List<WorkCreateAssignment>): String? {
        if (title.trim().isEmpty() || title.trim().length > 200) {
            return "Vui lòng nhập tên công việc (tối đa 200 ký tự)."
        }
        if (assignments.isEmpty()) {
            return "Vui lòng thêm ít nhất một phân công."
        }
        assignments.forEachIndexed { index, row ->
            val label = "Phân công ${index + 1}"
            if (row.isIndividual) {
                if (row.userIds.none { it.isNotBlank() }) return "$label: chọn người nhận."
            } else if (row.departmentId.isBlank()) {
                return "$label: chọn phòng ban."
            }
            if (row.content.trim().isEmpty() || row.content.trim().length > 2000) {
                return "$label: nhập nội dung công việc (tối đa 2000 ký tự)."
            }
            if (!DATE_RE.matches(row.deadline.trim())) {
                return "$label: chọn hạn chót."
            }
        }
        return null
    }

    private val DATE_RE = Regex("""^\d{4}-\d{2}-\d{2}$""")
}
