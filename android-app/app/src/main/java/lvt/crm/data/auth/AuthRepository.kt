package lvt.crm.data.auth

import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Temporary auth store for UI scaffolding.
 * Next step: call Convex Auth (email/password) same as web.
 */
class AuthRepository {
    private val _state = MutableStateFlow<AuthState>(AuthState.SignedOut)
    val state: StateFlow<AuthState> = _state.asStateFlow()

    suspend fun signIn(email: String, password: String): Result<UserSession> {
        delay(400)
        val normalized = email.trim().lowercase()
        if (normalized.isEmpty() || password.isEmpty()) {
            return Result.failure(IllegalArgumentException("EMAIL_PASSWORD_REQUIRED"))
        }
        // Scaffold only — always succeeds for non-empty credentials until Convex is connected.
        val session = UserSession(
            userId = "local-scaffold",
            email = normalized,
            name = normalized.substringBefore("@"),
            role = "user",
            mustChangePassword = false,
        )
        _state.value = AuthState.SignedIn(session)
        return Result.success(session)
    }

    fun signOut() {
        _state.value = AuthState.SignedOut
    }
}
