package lvt.crm.data.duties

import lvt.crm.data.convex.ConvexConfig
import lvt.crm.data.convex.ConvexException
import lvt.crm.data.convex.ConvexHttpClient
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject
import java.io.File
import java.net.URLEncoder
import java.util.concurrent.TimeUnit

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
    val locationText: String = "",
    val otherParticipants: String = "",
)

data class DutiesSnapshot(
    val attendanceConfirmationEnabled: Boolean,
    val duties: List<DutyItem>,
    val canCreate: Boolean = false,
    val isAdmin: Boolean = false,
    val canViewAll: Boolean = false,
)

data class SharedSchedulePdf(
    val file: File,
    val fileName: String,
)

interface DutiesOperations {
    suspend fun listMine(): DutiesSnapshot
    suspend fun setAttendance(dutyId: String, status: String)
}

class DutiesRepository(
    private val convex: ConvexHttpClient,
    private val tokenProvider: () -> String? = { null },
    cacheDir: File? = null,
    private val webUrl: String = ConvexConfig.webUrl,
) : DutiesOperations {
    private val downloadHttp = OkHttpClient.Builder()
        .connectTimeout(20, TimeUnit.SECONDS)
        .readTimeout(120, TimeUnit.SECONDS)
        .writeTimeout(45, TimeUnit.SECONDS)
        .followRedirects(true)
        .build()
    private val pdfCacheDir = cacheDir?.let { File(it, "shared-duty-pdfs") }
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
                            locationText = d.optString("locationText"),
                            otherParticipants = d.optString("otherParticipants"),
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

    suspend fun downloadSharedSchedulePdf(mode: String, anchorIso: String): SharedSchedulePdf {
        val token = tokenProvider()?.takeIf { it.isNotBlank() }
            ?: throw ConvexException("UNAUTHORIZED", "Bạn cần đăng nhập để xem lịch công tác chung.")
        val encodedMode = URLEncoder.encode(mode, Charsets.UTF_8.name())
        val encodedAnchor = URLEncoder.encode(anchorIso, Charsets.UTF_8.name())
        val url = "${webUrl.trimEnd('/')}/api/duties/shared-schedule.pdf?mode=$encodedMode&anchor=$encodedAnchor"
        val request = Request.Builder()
            .url(url)
            .header("Authorization", "Bearer $token")
            .get()
            .build()
        val directory = (pdfCacheDir ?: File(System.getProperty("java.io.tmpdir"), "lvt-shared-duty-pdfs")).apply { mkdirs() }
        val downloaded = File.createTempFile("lvt-lct-", ".pdf", directory)
        try {
            downloadHttp.newCall(request).execute().use { response ->
                if (response.code == 401 || response.code == 403) {
                    throw ConvexException("FORBIDDEN", "Bạn không có quyền xem lịch công tác chung.")
                }
                if (!response.isSuccessful) {
                    throw ConvexException("SHARED_SCHEDULE_FAILED", "Không tải được lịch công tác chung. Hãy thử lại.")
                }
                val body = response.body
                    ?: throw ConvexException("SHARED_SCHEDULE_FAILED", "Không tải được lịch công tác chung. Hãy thử lại.")
                body.byteStream().use { input ->
                    downloaded.outputStream().use { output -> input.copyTo(output) }
                }
                if (downloaded.length() <= 0L) {
                    throw ConvexException("SHARED_SCHEDULE_FAILED", "Không tải được lịch công tác chung. Hãy thử lại.")
                }
                val fileName = dispositionFileName(response.header("Content-Disposition"))
                    ?: "LCT.pdf"
                return SharedSchedulePdf(file = downloaded, fileName = fileName)
            }
        } catch (error: ConvexException) {
            downloaded.delete()
            throw error
        } catch (error: Exception) {
            downloaded.delete()
            throw ConvexException("SHARED_SCHEDULE_FAILED", "Không tải được lịch công tác chung. Hãy thử lại.")
        }
    }
}

private fun dispositionFileName(header: String?): String? {
    val value = header?.trim().orEmpty()
    if (value.isBlank()) return null
    val utf = Regex("filename\\*=UTF-8''([^;]+)", RegexOption.IGNORE_CASE).find(value)?.groupValues?.getOrNull(1)
    if (!utf.isNullOrBlank()) {
        return java.net.URLDecoder.decode(utf, Charsets.UTF_8.name())
    }
    val plain = Regex("filename=\"?([^\";]+)\"?", RegexOption.IGNORE_CASE).find(value)?.groupValues?.getOrNull(1)
    return plain?.trim()?.takeIf { it.isNotBlank() }
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
