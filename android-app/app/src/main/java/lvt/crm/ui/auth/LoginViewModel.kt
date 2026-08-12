package lvt.crm.ui.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import lvt.crm.data.auth.AuthRepository
import lvt.crm.data.auth.SignInGateway
import lvt.crm.data.convex.ConvexException
import lvt.crm.data.convex.ConvexHttpClient

enum class LoginMode {
    SignIn,
    ForgotPassword,
}

data class LoginUiState(
    val mode: LoginMode = LoginMode.SignIn,
    val email: String = "",
    val password: String = "",
    val loading: Boolean = false,
    val error: String? = null,
    val info: String? = null,
)

class LoginViewModel(
    private val authRepository: SignInGateway,
) : ViewModel() {
    private val _uiState = MutableStateFlow(LoginUiState())
    val uiState: StateFlow<LoginUiState> = _uiState.asStateFlow()

    fun onEmailChange(value: String) {
        _uiState.update { it.copy(email = value, error = null, info = null) }
    }

    fun onPasswordChange(value: String) {
        _uiState.update { it.copy(password = value, error = null, info = null) }
    }

    fun showForgotPassword() {
        _uiState.update {
            it.copy(
                mode = LoginMode.ForgotPassword,
                password = "",
                error = null,
                info = null,
            )
        }
    }

    fun showSignIn() {
        _uiState.update {
            it.copy(
                mode = LoginMode.SignIn,
                error = null,
                info = null,
            )
        }
    }

    fun signIn() {
        val current = _uiState.value
        if (current.loading || current.mode != LoginMode.SignIn) return
        _uiState.value = current.copy(loading = true, error = null, info = null)
        viewModelScope.launch {
            val result = try {
                authRepository.signIn(current.email, current.password)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                Result.failure(e)
            }
            _uiState.update {
                it.copy(
                    password = if (result.isSuccess) "" else it.password,
                    loading = false,
                    error = result.exceptionOrNull()?.let { err -> humanizeError(err) },
                )
            }
        }
    }

    fun requestPasswordReset() {
        val current = _uiState.value
        if (current.loading || current.mode != LoginMode.ForgotPassword) return
        _uiState.value = current.copy(loading = true, error = null, info = null)
        viewModelScope.launch {
            val result = try {
                authRepository.requestPasswordReset(current.email)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                Result.failure(e)
            }
            _uiState.update {
                if (result.isSuccess) {
                    it.copy(
                        mode = LoginMode.SignIn,
                        loading = false,
                        error = null,
                        info = "Nếu email tồn tại trong hệ thống, mật khẩu tạm đã được gửi. Kiểm tra hộp thư rồi đăng nhập và đổi mật khẩu mới.",
                    )
                } else {
                    it.copy(
                        loading = false,
                        info = null,
                        error = result.exceptionOrNull()?.let { err -> humanizeError(err) },
                    )
                }
            }
        }
    }

    private fun humanizeError(err: Throwable): String {
        val raw = err.message.orEmpty()
        val isGenericServerError = raw.equals("Server Error", ignoreCase = true) ||
            Regex("""^\[Request ID:[^\]]+]\s*Server Error\s*$""", RegexOption.IGNORE_CASE).matches(raw)
        return when {
            err.message == "EMAIL_PASSWORD_REQUIRED" ->
                "Vui lòng nhập email và mật khẩu."
            err.message == "EMAIL_REQUIRED" ->
                "Vui lòng nhập email."
            isGenericServerError ->
                "Không thể đăng nhập. Hãy kiểm tra email, mật khẩu rồi thử lại."
            err is ConvexException -> err.message
                ?: ConvexHttpClient.humanize("SIGN_IN_FAILED")
            else -> ConvexHttpClient.humanize(err.message ?: "SIGN_IN_FAILED")
        }
    }

    companion object {
        fun factory(authRepository: AuthRepository): ViewModelProvider.Factory =
            object : ViewModelProvider.Factory {
                @Suppress("UNCHECKED_CAST")
                override fun <T : ViewModel> create(modelClass: Class<T>): T {
                    return LoginViewModel(authRepository) as T
                }
            }
    }
}
