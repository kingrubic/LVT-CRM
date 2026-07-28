package lvt.crm.data.work

import lvt.crm.data.convex.ConvexHttpClient
import org.json.JSONObject

data class WorkTaskItem(
    val id: String,
    val kind: Kind,
    val title: String,
    val deadline: String,
    val status: String,
    val documentContent: String,
    val departmentName: String,
    val qualityPercent: Int?,
    val rejectionReason: String,
    val isAdmin: Boolean,
) {
    enum class Kind { WorkItem, PersonalTask }
}

data class WorkSnapshot(
    val assignerMode: String,
    val isAdmin: Boolean,
    val tasks: List<WorkTaskItem>,
)

class WorkRepository(
    private val convex: ConvexHttpClient,
) {
    suspend fun listMine(): WorkSnapshot {
        val result = convex.query("work:listMine")
        val isAdmin = result.optBoolean("isAdmin", false)
        val assignerMode = result.optString("assignerMode", "")
        val tasks = mutableListOf<WorkTaskItem>()

        val myTasks = result.optJSONArray("myTasks")
        if (myTasks != null) {
            for (i in 0 until myTasks.length()) {
                val t = myTasks.getJSONObject(i)
                tasks += WorkTaskItem(
                    id = t.optString("_id"),
                    kind = WorkTaskItem.Kind.WorkItem,
                    title = t.optString("content"),
                    deadline = t.optString("deadline"),
                    status = t.optString("status"),
                    documentContent = t.optString("documentContent"),
                    departmentName = t.optString("departmentName"),
                    qualityPercent = t.optIntOrNull("qualityPercent"),
                    rejectionReason = t.optString("rejectionReason"),
                    isAdmin = isAdmin,
                )
            }
        }

        val personal = result.optJSONArray("personalTasks")
        if (personal != null) {
            for (i in 0 until personal.length()) {
                val t = personal.getJSONObject(i)
                tasks += WorkTaskItem(
                    id = t.optString("_id"),
                    kind = WorkTaskItem.Kind.PersonalTask,
                    title = t.optString("title").ifBlank { t.optString("documentContent") },
                    deadline = t.optString("deadline"),
                    status = t.optString("status"),
                    documentContent = t.optString("documentContent"),
                    departmentName = t.optString("departmentName"),
                    qualityPercent = t.optIntOrNull("qualityPercent"),
                    rejectionReason = t.optString("rejectionReason"),
                    isAdmin = isAdmin,
                )
            }
        }

        return WorkSnapshot(
            assignerMode = assignerMode,
            isAdmin = isAdmin,
            tasks = tasks.sortedBy { it.deadline },
        )
    }

    suspend fun complete(item: WorkTaskItem, qualityPercent: Int? = null) {
        val args = JSONObject()
        if (qualityPercent != null) {
            args.put("qualityPercent", qualityPercent)
        }
        when (item.kind) {
            WorkTaskItem.Kind.WorkItem -> {
                args.put("workItemId", item.id)
                convex.mutation("work:completeWorkItem", args)
            }
            WorkTaskItem.Kind.PersonalTask -> {
                args.put("taskId", item.id)
                convex.mutation("work:completePersonalTask", args)
            }
        }
    }
}

private fun JSONObject.optIntOrNull(key: String): Int? {
    if (!has(key) || isNull(key)) return null
    return optInt(key)
}
