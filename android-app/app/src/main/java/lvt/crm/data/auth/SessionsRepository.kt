package lvt.crm.data.auth

import android.os.Build
import lvt.crm.data.convex.ConvexException
import lvt.crm.data.convex.ConvexHttpClient
import org.json.JSONArray
import org.json.JSONObject

data class DeviceSession(
    val sessionId: String,
    val isCurrent: Boolean,
    val deviceName: String,
    val platformLabel: String,
    val clientKind: String,
    val lastActiveAt: Long,
)

class SessionsRepository(
    private val convex: ConvexHttpClient,
) {
    suspend fun registerCurrentDevice(pushToken: String? = null): Result<Unit> {
        return try {
            val args = JSONObject()
                .put("deviceName", Build.MODEL?.takeIf { it.isNotBlank() } ?: "Android")
                .put("platformLabel", "CRM Lê Văn Tám Android")
                .put("clientKind", "android")
                .put("appVersion", Build.VERSION.RELEASE ?: "")
            if (!pushToken.isNullOrBlank()) args.put("pushToken", pushToken)
            convex.mutation("sessions:registerCurrent", args)
            Result.success(Unit)
        } catch (e: ConvexException) {
            Result.failure(e)
        } catch (e: Exception) {
            Result.failure(ConvexException("DEVICE_REGISTER_FAILED", e.message ?: "DEVICE_REGISTER_FAILED"))
        }
    }

    suspend fun listMine(): Result<List<DeviceSession>> {
        return try {
            val result = convex.query("sessions:listMine")
            val array = result.optJSONArray("items") ?: JSONArray()
            val list = (0 until array.length()).mapNotNull { index ->
                array.optJSONObject(index)?.toDeviceSession()
            }
            Result.success(list)
        } catch (e: ConvexException) {
            Result.failure(e)
        } catch (e: Exception) {
            Result.failure(ConvexException("SESSIONS_LOAD_FAILED", e.message ?: "SESSIONS_LOAD_FAILED"))
        }
    }

    suspend fun revoke(sessionId: String): Result<Unit> {
        return try {
            convex.action("sessions:revokeMine", JSONObject().put("sessionId", sessionId))
            Result.success(Unit)
        } catch (e: ConvexException) {
            Result.failure(e)
        } catch (e: Exception) {
            Result.failure(ConvexException("SESSION_REVOKE_FAILED", e.message ?: "SESSION_REVOKE_FAILED"))
        }
    }

    suspend fun revokeAllOthers(): Result<Unit> {
        return try {
            convex.action("sessions:revokeAllOthers", JSONObject())
            Result.success(Unit)
        } catch (e: ConvexException) {
            Result.failure(e)
        } catch (e: Exception) {
            Result.failure(ConvexException("SESSION_REVOKE_FAILED", e.message ?: "SESSION_REVOKE_FAILED"))
        }
    }

    private fun JSONObject.toDeviceSession(): DeviceSession? {
        val id = optString("sessionId").ifBlank { return null }
        return DeviceSession(
            sessionId = id,
            isCurrent = optBoolean("isCurrent", false),
            deviceName = optString("deviceName", "Android"),
            platformLabel = optString("platformLabel", "CRM Lê Văn Tám Android"),
            clientKind = optString("clientKind", "android"),
            lastActiveAt = optLong("lastActiveAt", 0L),
        )
    }
}
