package lvt.crm.data.chat

import lvt.crm.data.convex.ConvexHttpClient
import org.json.JSONArray
import org.json.JSONObject

class ChatRepository(
    private val convex: ConvexHttpClient,
) {
    suspend fun list(target: ChatTarget): ChatThread {
        val (path, args, titleKey, fallback) = request(target)
        val result = convex.query(path, args)
        return parseThread(result, titleKey, target.title.ifBlank { fallback })
    }

    suspend fun send(target: ChatTarget, bodyHtml: String) {
        val (path, idName) = when (target.kind) {
            ChatKind.Duty -> "dutyMessages:create" to "dutyId"
            ChatKind.Work -> "workMessages:create" to "documentId"
        }
        convex.mutation(
            path,
            JSONObject().put(idName, target.entityId).put("bodyHtml", bodyHtml),
        )
    }

    suspend fun recall(target: ChatTarget, messageId: String) {
        val path = when (target.kind) {
            ChatKind.Duty -> "dutyMessages:recall"
            ChatKind.Work -> "workMessages:recall"
        }
        convex.mutation(path, JSONObject().put("messageId", messageId))
    }

    private fun request(target: ChatTarget): ThreadRequest = when (target.kind) {
        ChatKind.Duty -> ThreadRequest(
            path = "dutyMessages:list",
            args = JSONObject().put("dutyId", target.entityId),
            titleKey = "dutyTitle",
            fallback = "Công tác",
        )
        ChatKind.Work -> ThreadRequest(
            path = "workMessages:list",
            args = JSONObject().put("documentId", target.entityId),
            titleKey = "documentTitle",
            fallback = "Công việc",
        )
    }

    private fun parseThread(json: JSONObject, titleKey: String, fallback: String): ChatThread {
        val array = json.optJSONArray("messages") ?: JSONArray()
        val messages = buildList {
            for (index in 0 until array.length()) {
                val item = array.optJSONObject(index) ?: continue
                val id = item.optString("_id")
                if (id.isBlank()) continue
                val name = item.optString("authorName").ifBlank { "Người dùng" }
                add(
                    ChatMessage(
                        id = id,
                        authorName = name,
                        authorInitials = item.optString("authorInitials").ifBlank { chatAuthorInitials(name) },
                        bodyHtml = item.optString("bodyHtml"),
                        createdAt = item.optLong("createdAt"),
                        recalled = item.optBoolean("recalled"),
                        canRecall = item.optBoolean("canRecall"),
                        isSelf = item.optBoolean("isSelf"),
                    ),
                )
            }
        }
        return ChatThread(
            title = json.optString(titleKey).ifBlank { fallback },
            messages = messages,
        )
    }

    private data class ThreadRequest(
        val path: String,
        val args: JSONObject,
        val titleKey: String,
        val fallback: String,
    )
}
