package lvt.crm.data.auth

/**
 * Session placeholder until Convex Auth Password provider is wired.
 * Admin/Mod see the same staff menus as normal users (no system admin).
 */
data class UserSession(
    val userId: String,
    val email: String,
    val name: String,
    val role: String,
    val mustChangePassword: Boolean = false,
) {
    val isOperationalManager: Boolean
        get() = role == "admin" || role == "moderator"
}

sealed interface AuthState {
    data object Loading : AuthState
    data object SignedOut : AuthState
    data class SignedIn(val session: UserSession) : AuthState
}
