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
            ChatKind.Group -> "groupMessages:create" to "groupId"
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
            ChatKind.Group -> "groupMessages:recall"
        }
        convex.mutation(path, JSONObject().put("messageId", messageId))
    }

    suspend fun inbox(): ChatInboxSnapshot {
        val json = convex.query("chatHub:list")
        val array = json.optJSONArray("conversations") ?: JSONArray()
        val conversations = buildList {
            for (index in 0 until array.length()) {
                val item = array.optJSONObject(index) ?: continue
                val kind = chatKindFromWire(item.optString("kind")) ?: continue
                val entityId = item.optString("entityId")
                if (entityId.isBlank()) continue
                add(
                    ChatConversation(
                        threadKey = item.optString("threadKey").ifBlank { chatThreadKey(kind, entityId) },
                        kind = kind,
                        entityId = entityId,
                        title = item.optString("title"),
                        lastBodyText = item.optString("lastBodyText"),
                        lastMessageAt = item.optLong("lastMessageAt"),
                        lastAuthorUserId = item.optString("lastAuthorUserId"),
                        unreadCount = item.optInt("unreadCount"),
                        memberCount = item.optInt("memberCount"),
                        viewerIsMember = if (item.has("viewerIsMember")) item.optBoolean("viewerIsMember") else true,
                    ),
                )
            }
        }
        return ChatInboxSnapshot(
            currentUserId = json.optString("currentUserId"),
            isAdmin = json.optBoolean("isAdmin"),
            backfillPending = json.optBoolean("backfillPending"),
            conversations = conversations,
        )
    }

    suspend fun unreadTotal(): Int = convex.query("chatHub:unreadTotal").optInt("count")

    suspend fun markRead(threadKey: String) {
        convex.mutation("chatHub:markRead", JSONObject().put("threadKey", threadKey))
    }

    suspend fun archiveMine(threadKey: String) {
        convex.mutation("chatHub:archiveMine", JSONObject().put("threadKey", threadKey))
    }

    suspend fun continueBackfill(): Boolean = convex.mutation("chatHub:continueBackfill").optBoolean("done")

    suspend fun directory(): List<ChatPerson> {
        val array = convex.query("chatHub:directory").optJSONArray("people") ?: return emptyList()
        return buildList {
            for (index in 0 until array.length()) {
                val item = array.optJSONObject(index) ?: continue
                val userId = item.optString("userId")
                if (userId.isBlank()) continue
                add(
                    ChatPerson(
                        userId = userId,
                        name = item.optString("name").ifBlank { "Người dùng" },
                        email = item.optString("email"),
                        departmentName = item.optString("departmentName"),
                    ),
                )
            }
        }
    }

    suspend fun groupState(groupId: String): ChatGroupState? {
        val json = convex.query("chatHub:groupState", JSONObject().put("groupId", groupId))
        val id = json.optString("groupId")
        if (id.isBlank()) return null
        val members = json.optJSONArray("members") ?: JSONArray()
        return ChatGroupState(
            groupId = id,
            name = json.optString("name"),
            memberCount = json.optInt("memberCount"),
            canManage = json.optBoolean("canManage"),
            canDissolve = json.optBoolean("canDissolve"),
            canLeave = json.optBoolean("canLeave"),
            canSend = json.optBoolean("canSend"),
            members = buildList {
                for (index in 0 until members.length()) {
                    val item = members.optJSONObject(index) ?: continue
                    val userId = item.optString("userId")
                    if (userId.isBlank()) continue
                    add(
                        ChatGroupMember(
                            userId = userId,
                            name = item.optString("name").ifBlank { "Người dùng" },
                            role = item.optString("role").ifBlank { "member" },
                            isSelf = item.optBoolean("isSelf"),
                        ),
                    )
                }
            },
        )
    }

    suspend fun createGroup(name: String, memberIds: List<String>): String {
        val ids = JSONArray()
        memberIds.forEach { ids.put(it) }
        val result = convex.mutation(
            "chatHub:createGroup",
            JSONObject().put("name", name).put("memberIds", ids),
        )
        return result.optString("groupId")
    }

    suspend fun renameGroup(groupId: String, name: String) {
        convex.mutation(
            "chatHub:renameGroup",
            JSONObject().put("groupId", groupId).put("name", name),
        )
    }

    suspend fun addMembers(groupId: String, memberIds: List<String>) {
        val ids = JSONArray()
        memberIds.forEach { ids.put(it) }
        convex.mutation(
            "chatHub:addMembers",
            JSONObject().put("groupId", groupId).put("memberIds", ids),
        )
    }

    suspend fun removeMember(groupId: String, userId: String) {
        convex.mutation(
            "chatHub:removeMember",
            JSONObject().put("groupId", groupId).put("userId", userId),
        )
    }

    suspend fun leaveGroup(groupId: String) {
        convex.mutation("chatHub:leaveGroup", JSONObject().put("groupId", groupId))
    }

    suspend fun dissolveGroup(groupId: String) {
        convex.mutation("chatHub:dissolveGroup", JSONObject().put("groupId", groupId))
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
        ChatKind.Group -> ThreadRequest(
            path = "groupMessages:list",
            args = JSONObject().put("groupId", target.entityId),
            titleKey = "groupTitle",
            fallback = "Nhóm",
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
