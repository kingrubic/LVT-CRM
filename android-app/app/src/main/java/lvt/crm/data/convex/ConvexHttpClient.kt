package lvt.crm.data.convex

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.TimeUnit

class ConvexException(val code: String, message: String = code) : Exception(message)

class ConvexHttpClient(
    private val baseUrl: String,
    private val tokenProvider: () -> String?,
    private val onTokensRefreshed: ((accessToken: String, refreshToken: String) -> Unit)? = null,
    private val refreshTokenProvider: (() -> String?)? = null,
) {
    private val jsonMedia = "application/json; charset=utf-8".toMediaType()
    private val http = OkHttpClient.Builder()
        .connectTimeout(20, TimeUnit.SECONDS)
        .readTimeout(45, TimeUnit.SECONDS)
        .writeTimeout(45, TimeUnit.SECONDS)
        .build()

    suspend fun query(path: String, args: JSONObject = JSONObject(), authenticated: Boolean = true): JSONObject =
        call("query", path, args, authenticated)

    suspend fun mutation(path: String, args: JSONObject = JSONObject(), authenticated: Boolean = true): JSONObject =
        call("mutation", path, args, authenticated)

    suspend fun action(path: String, args: JSONObject = JSONObject(), authenticated: Boolean = true): JSONObject =
        call("action", path, args, authenticated)

    private suspend fun call(
        kind: String,
        path: String,
        args: JSONObject,
        authenticated: Boolean,
        retried: Boolean = false,
    ): JSONObject = withContext(Dispatchers.IO) {
        val body = JSONObject()
            .put("path", path)
            .put("args", args)
            .put("format", "json")
            .toString()
            .toRequestBody(jsonMedia)

        val builder = Request.Builder()
            .url("${baseUrl.trimEnd('/')}/api/$kind")
            .post(body)
            .header("Content-Type", "application/json")

        if (authenticated) {
            val token = tokenProvider()
            if (!token.isNullOrBlank()) {
                builder.header("Authorization", "Bearer $token")
            }
        }

        http.newCall(builder.build()).execute().use { response ->
            val raw = response.body?.string().orEmpty()
            val json = runCatching { JSONObject(raw) }.getOrElse {
                throw ConvexException("HTTP_${response.code}", "Phản hồi Convex không hợp lệ (${response.code}).")
            }

            if (json.optString("status") == "success") {
                val value = json.opt("value")
                return@withContext when (value) {
                    null, JSONObject.NULL -> JSONObject()
                    is JSONObject -> value
                    is JSONArray -> JSONObject().put("items", value)
                    is Boolean -> JSONObject().put("ok", value)
                    is Number, is String -> JSONObject().put("value", value)
                    else -> JSONObject().put("value", value.toString())
                }
            }

            val errorMessage = json.optString("errorMessage").ifBlank {
                json.optString("error").ifBlank { "CONVEX_ERROR" }
            }
            val unauthorized = response.code == 401 ||
                errorMessage.contains("Unauthenticated", ignoreCase = true) ||
                errorMessage.contains("Authentication", ignoreCase = true)

            if (authenticated && unauthorized && !retried) {
                if (tryRefresh()) {
                    return@withContext call(kind, path, args, authenticated = true, retried = true)
                }
            }

            throw ConvexException(extractCode(errorMessage), humanize(errorMessage))
        }
    }

    private fun tryRefresh(): Boolean {
        val refresh = refreshTokenProvider?.invoke()?.takeIf { it.isNotBlank() } ?: return false
        return try {
            val body = JSONObject()
                .put("path", "auth:signIn")
                .put("args", JSONObject().put("refreshToken", refresh))
                .put("format", "json")
                .toString()
                .toRequestBody(jsonMedia)
            val request = Request.Builder()
                .url("${baseUrl.trimEnd('/')}/api/action")
                .post(body)
                .header("Content-Type", "application/json")
                .build()
            http.newCall(request).execute().use { response ->
                val raw = response.body?.string().orEmpty()
                val json = JSONObject(raw)
                if (json.optString("status") != "success") return false
                val tokens = json.getJSONObject("value").getJSONObject("tokens")
                val access = tokens.getString("token")
                val nextRefresh = tokens.getString("refreshToken")
                onTokensRefreshed?.invoke(access, nextRefresh)
                true
            }
        } catch (_: Exception) {
            false
        }
    }

    companion object {
        fun extractCode(message: String): String {
            val known = listOf(
                "InvalidAccountId",
                "InvalidSecret",
                "Invalid credentials",
                "USER_NOT_ACTIVE",
                "PASSWORD_TOO_SHORT",
                "PASSWORD_CHANGE_FAILED",
                "PASSWORD_CHANGED_SYNC_PENDING",
                "PASSWORD_CHANGE_REQUIRED",
                "PUBLIC_SIGNUP_DISABLED",
                "INVALID_EMAIL",
                "INVALID_AUTH_FLOW",
                "FORBIDDEN",
                "UNAUTHENTICATED",
            )
            return known.firstOrNull { message.contains(it, ignoreCase = true) } ?: message
        }

        fun humanize(message: String): String {
            val code = extractCode(message)
            return when {
                code.contains("Invalid", ignoreCase = true) ||
                    code.contains("credentials", ignoreCase = true) ->
                    "Email hoặc mật khẩu không đúng."
                code == "USER_NOT_ACTIVE" -> "Tài khoản chưa được kích hoạt hoặc đã bị khóa."
                code == "PASSWORD_TOO_SHORT" -> "Mật khẩu phải có ít nhất 8 ký tự."
                code == "PASSWORD_CHANGE_FAILED" -> "Không đổi được mật khẩu. Thử lại sau."
                code == "PASSWORD_CHANGED_SYNC_PENDING" ->
                    "Mật khẩu đã đổi nhưng hồ sơ chưa đồng bộ. Đăng nhập lại."
                code == "PASSWORD_CHANGE_REQUIRED" -> "Bạn cần đổi mật khẩu trước khi tiếp tục."
                code == "ATTENDANCE_OUTSIDE_WINDOW" -> "Chỉ xác nhận trong thời gian công tác đang diễn ra."
                code == "ATTENDANCE_CONFIRMATION_DISABLED" -> "Hệ thống đang tắt xác nhận tham dự."
                code == "NOT_A_PARTICIPANT" -> "Bạn không nằm trong danh sách tham dự."
                code == "QUALITY_PERCENT_REQUIRED" -> "Cần nhập phần trăm chất lượng."
                code.contains("FORBIDDEN", ignoreCase = true) -> "Bạn không có quyền thực hiện thao tác này."
                else -> code.take(180)
            }
        }
    }
}
