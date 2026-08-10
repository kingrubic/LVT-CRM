package lvt.crm.data.convex

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.TimeUnit
import lvt.crm.data.auth.CredentialSnapshot

class ConvexException(val code: String, message: String = code) : Exception(message)

interface AuthApi {
    suspend fun query(path: String, args: JSONObject = JSONObject(), authenticated: Boolean = true): JSONObject
    suspend fun action(path: String, args: JSONObject = JSONObject(), authenticated: Boolean = true): JSONObject
    suspend fun actionWithToken(path: String, args: JSONObject, accessToken: String): JSONObject
}

class ConvexHttpClient(
    private val baseUrl: String,
    private val tokenProvider: () -> String?,
    private val onTokensRefreshed: ((CredentialSnapshot, String, String) -> Boolean)? = null,
    private val refreshCredentialsProvider: (() -> CredentialSnapshot?)? = null,
) : AuthApi {
    private val jsonMedia = "application/json; charset=utf-8".toMediaType()
    private val refreshMutex = Mutex()
    private val http = OkHttpClient.Builder()
        .connectTimeout(20, TimeUnit.SECONDS)
        .readTimeout(45, TimeUnit.SECONDS)
        .writeTimeout(45, TimeUnit.SECONDS)
        .build()

    override suspend fun query(path: String, args: JSONObject, authenticated: Boolean): JSONObject =
        call("query", path, args, authenticated)

    suspend fun mutation(path: String, args: JSONObject = JSONObject(), authenticated: Boolean = true): JSONObject =
        call("mutation", path, args, authenticated)

    override suspend fun action(path: String, args: JSONObject, authenticated: Boolean): JSONObject =
        call("action", path, args, authenticated)

    suspend fun mutationWithToken(path: String, args: JSONObject, accessToken: String): JSONObject =
        call("mutation", path, args, authenticated = true, accessTokenOverride = accessToken)

    override suspend fun actionWithToken(path: String, args: JSONObject, accessToken: String): JSONObject =
        call("action", path, args, authenticated = true, accessTokenOverride = accessToken)

    private suspend fun call(
        kind: String,
        path: String,
        args: JSONObject,
        authenticated: Boolean,
        retried: Boolean = false,
        accessTokenOverride: String? = null,
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

        val requestToken = if (authenticated) accessTokenOverride ?: tokenProvider() else null
        if (authenticated) {
            val token = requestToken
            if (!token.isNullOrBlank()) {
                builder.header("Authorization", "Bearer $token")
            }
        }

        http.newCall(builder.build()).execute().use { response ->
            val raw = response.body?.string().orEmpty()
            if (authenticated && accessTokenOverride == null && response.code == 401 && !retried) {
                val refreshedToken = tryRefresh(requestToken)
                if (refreshedToken != null) {
                    return@withContext call(
                        kind,
                        path,
                        args,
                        authenticated = true,
                        retried = true,
                        accessTokenOverride = refreshedToken,
                    )
                }
            }
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

            if (authenticated && accessTokenOverride == null && unauthorized && !retried) {
                val refreshedToken = tryRefresh(requestToken)
                if (refreshedToken != null) {
                    return@withContext call(
                        kind,
                        path,
                        args,
                        authenticated = true,
                        retried = true,
                        accessTokenOverride = refreshedToken,
                    )
                }
            }

            throw ConvexException(extractCode(errorMessage), humanize(errorMessage))
        }
    }

    private suspend fun tryRefresh(failedAccessToken: String?): String? = refreshMutex.withLock {
        val expected = refreshCredentialsProvider?.invoke() ?: return@withLock null
        if (failedAccessToken.isNullOrBlank() || expected.accessToken != failedAccessToken) return@withLock null
        val updateTokens = onTokensRefreshed ?: return@withLock null
        val refreshed = try {
            val body = JSONObject()
                .put("path", "auth:signIn")
                .put("args", JSONObject().put("refreshToken", expected.refreshToken))
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
                if (json.optString("status") != "success") return@use null
                val tokens = json.getJSONObject("value").getJSONObject("tokens")
                val access = tokens.getString("token")
                val nextRefresh = tokens.getString("refreshToken")
                access to nextRefresh
            }
        } catch (_: Exception) {
            return@withLock null
        } ?: return@withLock null
        val persisted = try {
            updateTokens(expected, refreshed.first, refreshed.second)
        } catch (e: Exception) {
            throw ConvexException("TOKEN_PERSIST_FAILED", e.message ?: "TOKEN_PERSIST_FAILED")
        }
        if (persisted) refreshed.first else null
    }

    companion object {
        fun extractCode(message: String): String {
            val known = listOf(
                "InvalidAccountId",
                "InvalidSecret",
                "Invalid credentials",
                "USER_NOT_ACTIVE",
                "ACCOUNT_LOCKED",
                "PASSWORD_TOO_SHORT",
                "PASSWORD_CHANGE_FAILED",
                "PASSWORD_CHANGED_SYNC_PENDING",
                "PASSWORD_CHANGE_REQUIRED",
                "PASSWORD_RESET_FAILED",
                "PASSWORD_RESET_EMAIL_FAILED",
                "MAIL_NOT_CONFIGURED",
                "MAIL_AUTH_FAILED",
                "PUBLIC_SIGNUP_DISABLED",
                "INVALID_EMAIL",
                "INVALID_AUTH_FLOW",
                "FORBIDDEN",
                "UNAUTHENTICATED",
                "CANNOT_REVOKE_CURRENT_SESSION",
                "SESSION_NOT_FOUND",
            )
            return known.firstOrNull { message.contains(it, ignoreCase = true) } ?: message
        }

        fun humanize(message: String): String {
            val code = extractCode(message)
            return when {
                code.contains("Invalid", ignoreCase = true) ||
                    code.contains("credentials", ignoreCase = true) ->
                    "Email hoặc mật khẩu không đúng."
                code == "ACCOUNT_LOCKED" ->
                    "Tài khoản đã bị khóa do đăng nhập sai quá số lần. Liên hệ quản trị viên để mở khóa."
                code == "USER_NOT_ACTIVE" -> "Tài khoản chưa được kích hoạt hoặc đã bị khóa."
                code == "PASSWORD_TOO_SHORT" -> "Mật khẩu phải có ít nhất 8 ký tự."
                code == "CANNOT_REVOKE_CURRENT_SESSION" -> "Không thể thu hồi phiên đang dùng."
                code == "SESSION_NOT_FOUND" -> "Phiên đăng nhập không còn tồn tại."
                code == "PASSWORD_CHANGE_FAILED" -> "Không đổi được mật khẩu. Thử lại sau."
                code == "PASSWORD_CHANGED_SYNC_PENDING" ->
                    "Mật khẩu đã đổi nhưng hồ sơ chưa đồng bộ. Đăng nhập lại."
                code == "PASSWORD_CHANGE_REQUIRED" -> "Bạn cần đổi mật khẩu trước khi tiếp tục."
                code == "PASSWORD_RESET_FAILED" -> "Không thể đặt lại mật khẩu. Thử lại sau."
                code == "PASSWORD_RESET_EMAIL_FAILED" ->
                    "Đã tạo mật khẩu tạm nhưng chưa gửi được email. Liên hệ quản trị viên."
                code == "MAIL_NOT_CONFIGURED" || code == "MAIL_AUTH_FAILED" ->
                    "Hệ thống chưa gửi được email. Liên hệ quản trị viên."
                code == "INVALID_EMAIL" -> "Email không hợp lệ."
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
