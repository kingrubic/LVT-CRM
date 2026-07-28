package lvt.crm.data.auth

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import lvt.crm.data.convex.ConvexException
import lvt.crm.data.convex.ConvexHttpClient
import org.json.JSONObject

class AuthRepository(
    private val tokenStore: TokenStore,
    private val convex: ConvexHttpClient,
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private val _state = MutableStateFlow<AuthState>(AuthState.Loading)
    val state: StateFlow<AuthState> = _state.asStateFlow()

    init {
        scope.launch { restoreSession() }
    }

    suspend fun restoreSession() {
        if (tokenStore.accessToken.isNullOrBlank()) {
            _state.value = AuthState.SignedOut
            return
        }
        try {
            val session = fetchSession()
            if (session == null) {
                tokenStore.clear()
                _state.value = AuthState.SignedOut
            } else {
                publish(session)
            }
        } catch (e: Exception) {
            // Keep tokens if network blip; only clear on hard auth failure.
            if (e is ConvexException && (
                    e.code.contains("Unauthenticated", ignoreCase = true) ||
                        e.code.contains("Authentication", ignoreCase = true)
                    )
            ) {
                tokenStore.clear()
                _state.value = AuthState.SignedOut
            } else if (tokenStore.accessToken.isNullOrBlank()) {
                _state.value = AuthState.SignedOut
            } else {
                // Stay loading-ish → treat as signed out so user can retry login
                _state.value = AuthState.SignedOut
            }
        }
    }

    suspend fun signIn(email: String, password: String): Result<UserSession> {
        val normalized = email.trim().lowercase()
        if (normalized.isEmpty() || password.isEmpty()) {
            return Result.failure(IllegalArgumentException("EMAIL_PASSWORD_REQUIRED"))
        }
        return try {
            val args = JSONObject()
                .put("provider", "password")
                .put(
                    "params",
                    JSONObject()
                        .put("email", normalized)
                        .put("password", password)
                        .put("flow", "signIn"),
                )
            val result = convex.action("auth:signIn", args, authenticated = false)
            val tokens = result.optJSONObject("tokens")
                ?: throw ConvexException("NO_TOKENS", "Đăng nhập không trả về token.")
            val access = tokens.getString("token")
            val refresh = tokens.getString("refreshToken")
            tokenStore.save(access, refresh)

            val session = fetchSession()
                ?: throw ConvexException("NO_SESSION", "Không tải được phiên đăng nhập.")
            publish(session)
            Result.success(session)
        } catch (e: ConvexException) {
            tokenStore.clear()
            Result.failure(e)
        } catch (e: Exception) {
            tokenStore.clear()
            Result.failure(ConvexException("SIGN_IN_FAILED", e.message ?: "SIGN_IN_FAILED"))
        }
    }

    suspend fun changePassword(newPassword: String): Result<Unit> {
        if (newPassword.length < 8) {
            return Result.failure(ConvexException("PASSWORD_TOO_SHORT", ConvexHttpClient.humanize("PASSWORD_TOO_SHORT")))
        }
        return try {
            convex.action("users:changeOwnPassword", JSONObject().put("newPassword", newPassword))
            val session = fetchSession()
            if (session != null) {
                publish(session)
            } else {
                // Password changed; force re-login if session vanished
                tokenStore.clear()
                _state.value = AuthState.SignedOut
            }
            Result.success(Unit)
        } catch (e: ConvexException) {
            Result.failure(e)
        } catch (e: Exception) {
            Result.failure(ConvexException("PASSWORD_CHANGE_FAILED", e.message ?: "PASSWORD_CHANGE_FAILED"))
        }
    }

    fun signOut() {
        scope.launch {
            try {
                convex.action("auth:signOut", JSONObject())
            } catch (_: Exception) {
                // Ignore — clear local session regardless.
            } finally {
                tokenStore.clear()
                _state.value = AuthState.SignedOut
            }
        }
    }

    private fun publish(session: UserSession) {
        _state.value = if (session.mustChangePassword) {
            AuthState.MustChangePassword(session)
        } else {
            AuthState.SignedIn(session)
        }
    }

    private suspend fun fetchSession(): UserSession? {
        val result = convex.query("users:sessionContext")
        val user = result.optJSONObject("user") ?: return null
        if (user.length() == 0) return null
        return UserSession(
            userId = user.optString("_id"),
            email = user.optString("email"),
            name = user.optString("name").ifBlank { user.optString("email") },
            role = user.optString("role", "user"),
            status = user.optString("status", "active"),
            mustChangePassword = user.optBoolean("mustChangePassword", false),
            departmentName = result.optJSONObject("department")?.optString("name"),
            positionName = result.optJSONObject("position")?.optString("name"),
            positionLevel = result.optJSONObject("position")?.optInt("level"),
        )
    }
}
