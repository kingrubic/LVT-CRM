package lvt.crm.data.work

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import lvt.crm.data.convex.ConvexConfig
import lvt.crm.data.convex.ConvexException
import lvt.crm.data.convex.ConvexHttpClient
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject
import java.io.File
import java.net.URLEncoder
import java.util.concurrent.TimeUnit

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

data class WorkMemberItem(
    val id: String,
    val name: String,
    val status: String,
)

data class WorkDocumentAssignment(
    val id: String,
    val departmentName: String,
    val content: String,
    val deadline: String,
    val status: String,
    val members: List<WorkMemberItem>,
)

data class WorkCompletionReviewItem(
    val workItemId: String,
    val userId: String,
    val userName: String,
    val content: String,
    val deadline: String,
    val departmentName: String,
)

data class WorkApprovalItem(
    val id: String,
    val fileName: String,
    val content: String,
    val deadline: String,
    val status: String,
    val approvalCount: Int,
    val approvalTotal: Int,
    val myDecision: String,
    val assignments: List<WorkDocumentAssignment> = emptyList(),
    val fileUrl: String = "",
    val privateFile: Boolean = false,
)

data class WorkSnapshot(
    val assignerMode: String,
    val isAdmin: Boolean,
    val accessLevel: Int,
    val tasks: List<WorkTaskItem>,
    val approvals: List<WorkApprovalItem>,
    val completionReviews: List<WorkCompletionReviewItem> = emptyList(),
)

internal data class ApprovalDecision(
    val userId: String,
    val approved: Boolean,
    val rejected: Boolean,
)

internal fun decisionForUser(currentUserId: String, approvers: List<ApprovalDecision>): String {
    val approver = approvers.firstOrNull { it.userId == currentUserId } ?: return ""
    return when {
        approver.approved -> "approved"
        approver.rejected -> "rejected"
        else -> ""
    }
}

interface WorkOperations {
    suspend fun listMine(): WorkSnapshot
    suspend fun complete(item: WorkTaskItem, qualityPercent: Int? = null)
    suspend fun decideApproval(documentId: String, approve: Boolean)
    suspend fun reviewCompletion(
        review: WorkCompletionReviewItem,
        approve: Boolean,
        qualityPercent: Int? = null,
        rejectionReason: String? = null,
    )
}

class WorkRepository(
    private val convex: ConvexHttpClient,
    private val tokenProvider: () -> String? = { null },
    cacheDir: File? = null,
    private val webUrl: String = ConvexConfig.webUrl,
) : WorkOperations {
    private val documentCache = cacheDir?.let { WorkDocumentCache(File(it, "work-documents")) }
    private val downloadHttp = OkHttpClient.Builder()
        .connectTimeout(20, TimeUnit.SECONDS)
        .readTimeout(180, TimeUnit.SECONDS)
        .writeTimeout(45, TimeUnit.SECONDS)
        .followRedirects(true)
        .build()
    override suspend fun listMine(): WorkSnapshot {
        val result = convex.query("work:listMine")
        val isAdmin = result.optBoolean("isAdmin", false)
        val accessLevel = result.optInt("level", 0)
        val assignerMode = result.optString("assignerMode", "")
        val currentUserId = result.optString("userId")
        val tasks = mutableListOf<WorkTaskItem>()
        val approvals = mutableListOf<WorkApprovalItem>()

        val approvalArray = result.optJSONArray("approvals")
        if (approvalArray != null) {
            for (i in 0 until approvalArray.length()) {
                val document = approvalArray.getJSONObject(i)
                val approvers = document.optJSONArray("approvers") ?: org.json.JSONArray()
                val decisions = mutableListOf<ApprovalDecision>()
                for (approverIndex in 0 until approvers.length()) {
                    val approver = approvers.optJSONObject(approverIndex) ?: continue
                    decisions += ApprovalDecision(
                        userId = approver.optString("_id"),
                        approved = approver.optBoolean("approved", false),
                        rejected = approver.optBoolean("rejected", false),
                    )
                }
                val myDecision = decisionForUser(currentUserId, decisions)
                approvals += WorkApprovalItem(
                    id = document.optString("_id"),
                    fileName = document.optString("fileName"),
                    content = document.optString("content"),
                    deadline = document.optString("deadline"),
                    status = document.optString("status"),
                    approvalCount = document.optInt("approvalCount"),
                    approvalTotal = document.optInt("approvalTotal"),
                    myDecision = myDecision,
                    assignments = parseAssignments(document.optJSONArray("assignments")),
                    fileUrl = document.optString("fileUrl"),
                    privateFile = document.optBoolean("privateFile", false),
                )
            }
        }

        var completionReviews = emptyList<WorkCompletionReviewItem>()
        if (isAdmin) {
            val adminResult = convex.query("work:listAdmin")
            approvals.clear()
            val documents = adminResult.optJSONArray("documents") ?: org.json.JSONArray()
            for (i in 0 until documents.length()) {
                val document = documents.getJSONObject(i)
                approvals += WorkApprovalItem(
                    id = document.optString("_id"),
                    fileName = document.optString("fileName"),
                    content = document.optString("content"),
                    deadline = document.optString("deadline"),
                    status = document.optString("status"),
                    approvalCount = document.optInt("approvalCount"),
                    approvalTotal = document.optInt("approvalTotal"),
                    myDecision = "",
                    assignments = parseAssignments(document.optJSONArray("assignments")),
                    fileUrl = document.optString("fileUrl"),
                    privateFile = document.optBoolean("privateFile", false),
                )
            }
            completionReviews = parseCompletionReviews(adminResult.optJSONArray("pendingCompletionReviews"))
        }

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
            accessLevel = accessLevel,
            tasks = orderedWorkTasks(tasks),
            approvals = approvals.sortedWith(compareBy<WorkApprovalItem>({ it.status != "pending" }, { it.deadline })),
            completionReviews = completionReviews,
        )
    }

    override suspend fun complete(item: WorkTaskItem, qualityPercent: Int?) {
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

    override suspend fun decideApproval(documentId: String, approve: Boolean) {
        val path = if (approve) "work:approveDocument" else "work:rejectDocument"
        convex.mutation(path, JSONObject().put("documentId", documentId))
    }

    override suspend fun reviewCompletion(
        review: WorkCompletionReviewItem,
        approve: Boolean,
        qualityPercent: Int?,
        rejectionReason: String?,
    ) {
        val args = JSONObject()
            .put("workItemId", review.workItemId)
            .put("userId", review.userId)
            .put("decision", if (approve) "approve" else "reject")
        if (qualityPercent != null) args.put("qualityPercent", qualityPercent)
        if (!rejectionReason.isNullOrBlank()) args.put("rejectionReason", rejectionReason)
        convex.mutation("work:reviewWorkCompletion", args)
    }

    suspend fun downloadDocument(document: WorkApprovalItem): File = withContext(Dispatchers.IO) {
        val cache = documentCache
            ?: throw ConvexException("WORK_FILE_UNAVAILABLE", "Tệp công văn chưa sẵn sàng để mở.")
        val request: Request
        val sourceIdentity: String
        val publicUrl = document.fileUrl.trim()
        if (publicUrl.isNotEmpty()) {
            request = Request.Builder().url(publicUrl).get().build()
            sourceIdentity = "public:${document.id}:$publicUrl"
        } else if (document.privateFile) {
            val token = tokenProvider()?.takeIf { it.isNotBlank() }
                ?: throw ConvexException("WORK_FILE_FORBIDDEN", "Bạn không còn quyền mở tệp công văn này.")
            val encodedId = URLEncoder.encode(document.id, Charsets.UTF_8.name()).replace("+", "%20")
            val base = webUrl.trimEnd('/')
            val metadataRequest = Request.Builder()
                .url("$base/api/files/$encodedId/metadata")
                .header("Authorization", "Bearer $token")
                .get()
                .build()
            val metadata = downloadHttp.newCall(metadataRequest).execute().use { response ->
                val body = response.body?.string().orEmpty()
                if (!response.isSuccessful) {
                    throw ConvexException("WORK_FILE_FORBIDDEN", "Bạn không còn quyền mở tệp công văn này.")
                }
                runCatching { JSONObject(body) }.getOrElse {
                    throw ConvexException("WORK_FILE_FORBIDDEN", "Bạn không còn quyền mở tệp công văn này.")
                }
            }
            val fileVersion = metadata.optString("fileVersion")
            if (fileVersion.isBlank()) {
                throw ConvexException("WORK_FILE_FORBIDDEN", "Bạn không còn quyền mở tệp công văn này.")
            }
            request = Request.Builder()
                .url("$base/api/files/$encodedId")
                .header("Authorization", "Bearer $token")
                .get()
                .build()
            sourceIdentity = "private:${document.id}:$fileVersion"
        } else {
            throw ConvexException("WORK_FILE_UNAVAILABLE", "Tệp công văn chưa sẵn sàng để mở.")
        }
        cache.cachedFile(sourceIdentity)?.let { cached ->
            return@withContext cached
        }
        val tempDir = cacheDirFallback().apply { mkdirs() }
        val downloaded = File.createTempFile("lvt-work-", ".part", tempDir)
        try {
            downloadHttp.newCall(request).execute().use { response ->
                if (!response.isSuccessful) {
                    throw ConvexException("WORK_FILE_DOWNLOAD_FAILED", "Không thể tải tệp công văn. Hãy thử lại.")
                }
                val body = response.body
                    ?: throw ConvexException("WORK_FILE_DOWNLOAD_FAILED", "Không thể tải tệp công văn. Hãy thử lại.")
                body.byteStream().use { input ->
                    downloaded.outputStream().use { output -> input.copyTo(output) }
                }
            }
            if (downloaded.length() <= 0L) {
                throw ConvexException("WORK_FILE_DOWNLOAD_FAILED", "Không thể tải tệp công văn. Hãy thử lại.")
            }
            return@withContext cache.store(
                downloaded,
                sourceIdentity,
                document.fileName.ifBlank { "cong-van" },
            )
        } catch (error: ConvexException) {
            downloaded.delete()
            throw error
        } catch (_: Exception) {
            downloaded.delete()
            throw ConvexException("WORK_FILE_DOWNLOAD_FAILED", "Không thể tải tệp công văn. Hãy thử lại.")
        }
    }

    private fun cacheDirFallback(): File = File(System.getProperty("java.io.tmpdir") ?: ".", "lvt-work-temp")
}

private fun parseAssignments(items: org.json.JSONArray?): List<WorkDocumentAssignment> {
    if (items == null) return emptyList()
    return List(items.length()) { index ->
        val item = items.getJSONObject(index)
        val members = item.optJSONArray("members") ?: org.json.JSONArray()
        WorkDocumentAssignment(
            id = item.optString("_id"),
            departmentName = item.optString("departmentName"),
            content = item.optString("content"),
            deadline = item.optString("deadline"),
            status = item.optString("status"),
            members = List(members.length()) { memberIndex ->
                val member = members.getJSONObject(memberIndex)
                WorkMemberItem(
                    id = member.optString("_id"),
                    name = member.optString("name").ifBlank { member.optString("email") },
                    status = member.optString("status"),
                )
            },
        )
    }
}

private fun parseCompletionReviews(items: org.json.JSONArray?): List<WorkCompletionReviewItem> {
    if (items == null) return emptyList()
    return List(items.length()) { index ->
        val item = items.getJSONObject(index)
        WorkCompletionReviewItem(
            workItemId = item.optString("workItemId"),
            userId = item.optString("userId"),
            userName = item.optString("userName"),
            content = item.optString("content"),
            deadline = item.optString("deadline"),
            departmentName = item.optString("departmentName"),
        )
    }
}

internal fun needsCompletion(status: String): Boolean = status in setOf(
    "pending_task",
    "pending",
    "overdue",
    "rejected",
    "rejected_completion",
)

internal fun orderedWorkTasks(tasks: List<WorkTaskItem>): List<WorkTaskItem> = tasks.sortedWith(
    compareBy<WorkTaskItem>(
        { !needsCompletion(it.status) },
        { it.deadline },
        { it.title },
    ),
)

private fun JSONObject.optIntOrNull(key: String): Int? {
    if (!has(key) || isNull(key)) return null
    return optInt(key)
}
