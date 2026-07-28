package lvt.crm.data.auth

/**
 * Session for navigation. Admin/Mod use the same staff menus as normal users in the app.
 */
data class UserSession(
    val userId: String,
    val email: String,
    val name: String,
    val role: String,
    val status: String,
    val mustChangePassword: Boolean = false,
    val departmentName: String? = null,
    val positionName: String? = null,
    val positionLevel: Int? = null,
) {
    val isOperationalManager: Boolean
        get() = role == "admin" || role == "moderator"
}

sealed interface AuthState {
    data object Loading : AuthState
    data object SignedOut : AuthState
    data class SignedIn(val session: UserSession) : AuthState
    data class MustChangePassword(val session: UserSession) : AuthState
}
