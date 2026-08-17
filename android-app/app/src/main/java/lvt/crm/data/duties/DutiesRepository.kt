package lvt.crm.data.duties

import lvt.crm.data.convex.ConvexHttpClient
import org.json.JSONObject

data class DutyDepartmentParticipants(
    val departmentName: String,
    val participantNames: List<String>,
)

data class DutyItem(
    val id: String,
    val content: String,
    val startDate: String,
    val endDate: String,
    val startTime: String,
    val endTime: String,
    val allDay: Boolean,
    val locationNames: List<String>,
    val departmentNames: List<String>,
    val departmentParticipants: List<DutyDepartmentParticipants>,
    val participantNames: List<String>,
    val myStatus: String,
    val isMine: Boolean,
    val isOngoing: Boolean,
    val isOverdue: Boolean,
    val isUpcoming: Boolean,
    val canMarkAttendance: Boolean,
    val title: String = "",
    val createdBy: String = "",
)

data class DutiesSnapshot(
    val attendanceConfirmationEnabled: Boolean,
    val duties: List<DutyItem>,
    val canCreate: Boolean = false,
    val isAdmin: Boolean = false,
    val canViewAll: Boolean = false,
)

interface DutiesOperations {
    suspend fun listMine(): DutiesSnapshot
    suspend fun setAttendance(dutyId: String, status: String)
}

class DutiesRepository(
    private val convex: ConvexHttpClient,
) : DutiesOperations {
    override suspend fun listMine(): DutiesSnapshot {
        val result = convex.query("duties:listMine")
        val array = result.optJSONArray("duties")
        val duties = buildList {
            if (array != null) {
                for (i in 0 until array.length()) {
                    val d = array.getJSONObject(i)
                    val timing = d.optJSONObject("timing") ?: JSONObject()
                    add(
                        DutyItem(
                            id = d.optString("_id"),
                            content = d.optString("content"),
                            startDate = d.optString("startDate"),
                            endDate = d.optString("endDate"),
                            startTime = d.optString("startTime"),
                            endTime = d.optString("endTime"),
                            allDay = d.optBoolean("allDay", false),
                            locationNames = d.optJSONArray("locationNames").toStringList(),
                            departmentNames = d.optJSONArray("departmentNames").toStringList(),
                            departmentParticipants = d.optJSONArray("departmentParticipants")
                                .toDepartmentParticipants(),
                            participantNames = d.optJSONArray("participantNames").toStringList(),
                            myStatus = d.optString("myStatus", "pending"),
                            isMine = d.optBoolean("isMine", false),
                            isOngoing = timing.optBoolean("isOngoing", false),
                            isOverdue = timing.optBoolean("isOverdue", false),
                            isUpcoming = timing.optBoolean("isUpcoming", false),
                            canMarkAttendance = timing.optBoolean("canMarkAttendance", false),
                            title = d.optString("title"),
                            createdBy = d.optString("createdBy"),
                        ),
                    )
                }
            }
        }
        return DutiesSnapshot(
            attendanceConfirmationEnabled = result.optBoolean("attendanceConfirmationEnabled", false),
            duties = duties,
            canCreate = result.optBoolean("canCreate", false),
            isAdmin = result.optBoolean("isAdmin", false),
            canViewAll = result.optBoolean("canViewAll", false),
        )
    }

    override suspend fun setAttendance(dutyId: String, status: String) {
        convex.mutation(
            "duties:setAttendance",
            JSONObject()
                .put("dutyId", dutyId)
                .put("status", status),
        )
    }
}

private fun org.json.JSONArray?.toStringList(): List<String> {
    if (this == null) return emptyList()
    return buildList {
        for (i in 0 until length()) {
            optString(i)?.takeIf { it.isNotBlank() }?.let { add(it) }
        }
    }
}

private fun org.json.JSONArray?.toDepartmentParticipants(): List<DutyDepartmentParticipants> {
    if (this == null) return emptyList()
    return buildList {
        for (index in 0 until length()) {
            val row = optJSONObject(index) ?: continue
            val departmentName = row.optString("departmentName").trim()
            if (departmentName.isBlank()) continue
            add(
                DutyDepartmentParticipants(
                    departmentName = departmentName,
                    participantNames = row.optJSONArray("participantNames").toStringList(),
                ),
            )
        }
    }
}
