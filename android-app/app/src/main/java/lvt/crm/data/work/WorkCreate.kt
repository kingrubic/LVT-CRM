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

data class WorkDocumentType(
    val id: String,
    val name: String,
    val code: String = "",
)

data class WorkFormOptions(
    val canCreate: Boolean,
    val isOps: Boolean,
    val departments: List<WorkFormDepartment>,
    val users: List<WorkFormUser>,
    val documentTypes: List<WorkDocumentType> = emptyList(),
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

    fun validate(
        title: String,
        assignments: List<WorkCreateAssignment>,
        hasFile: Boolean = false,
        documentTypeId: String = "",
    ): String? {
        if (title.trim().isEmpty() || title.trim().length > 200) {
            return "Vui lòng nhập tên công việc (tối đa 200 ký tự)."
        }
        if (assignments.isEmpty()) {
            return "Vui lòng thêm ít nhất một phân công."
        }
        if (hasFile && documentTypeId.trim().isEmpty()) {
            return "Vui lòng chọn loại văn bản."
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

const val WORK_LOCKED_MESSAGE = "Đã có người nộp · Không thể sửa hoặc xóa"

/**
 * Visibility follows `canEdit` / `canDelete` from the list payload.
 * Admin/mod (`isOps`) keep the longer server right: `updateDocument` / `deleteDocument`
 * still succeed after a submission, so the buttons stay available.
 */
object WorkDocumentActions {
    fun showsEdit(canEdit: Boolean, isOps: Boolean) = canEdit || isOps

    fun showsDelete(canDelete: Boolean, isOps: Boolean) = canDelete || isOps

    fun showsLocked(canEdit: Boolean, canDelete: Boolean, isOps: Boolean) =
        !showsEdit(canEdit, isOps) && !showsDelete(canDelete, isOps)

    fun errorMessage(raw: String, deleting: Boolean, fallback: String): String {
        if (raw.contains("WORK_DOCUMENT_IMMUTABLE")) return WORK_LOCKED_MESSAGE
        if (raw.contains("WORK_UPDATE_FORBIDDEN")) return "Bạn không có quyền sửa hoặc xóa công việc này."
        if (deleting) return "Không thể xóa công văn lúc này."
        return fallback
    }
}
