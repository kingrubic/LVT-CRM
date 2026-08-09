package lvt.crm.ui.auth

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import lvt.crm.data.auth.SignInGateway
import lvt.crm.data.auth.UserSession
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class LoginViewModelTest {
    private val dispatcher = StandardTestDispatcher()

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    @Test
    fun thrownSignInFailureStopsLoadingAndAllowsRetry() = runTest(dispatcher) {
        var attempts = 0
        val viewModel = LoginViewModel(
            object : SignInGateway {
                override suspend fun signIn(email: String, password: String): Result<UserSession> {
                    attempts++
                    throw IllegalStateException("transport failed")
                }

                override suspend fun requestPasswordReset(email: String): Result<Unit> =
                    Result.success(Unit)
            },
        )
        viewModel.onEmailChange("user@example.com")
        viewModel.onPasswordChange("password")

        viewModel.signIn()
        advanceUntilIdle()
        assertFalse(viewModel.uiState.value.loading)
        assertEquals("transport failed", viewModel.uiState.value.error)

        viewModel.signIn()
        advanceUntilIdle()
        assertEquals(2, attempts)
        assertFalse(viewModel.uiState.value.loading)
    }

    @Test
    fun successfulSignInClearsPlaintextPassword() = runTest(dispatcher) {
        val viewModel = LoginViewModel(
            object : SignInGateway {
                override suspend fun signIn(email: String, password: String): Result<UserSession> =
                    Result.success(session())

                override suspend fun requestPasswordReset(email: String): Result<Unit> =
                    Result.success(Unit)
            },
        )
        viewModel.onEmailChange("user@example.com")
        viewModel.onPasswordChange("password")

        viewModel.signIn()
        advanceUntilIdle()

        assertEquals("", viewModel.uiState.value.password)
        assertFalse(viewModel.uiState.value.loading)
        assertTrue(viewModel.uiState.value.error == null)
    }

    @Test
    fun forgotPasswordShowsInfoOnSuccess() = runTest(dispatcher) {
        var resetCalls = 0
        val viewModel = LoginViewModel(
            object : SignInGateway {
                override suspend fun signIn(email: String, password: String): Result<UserSession> =
                    Result.failure(IllegalStateException("unused"))

                override suspend fun requestPasswordReset(email: String): Result<Unit> {
                    resetCalls++
                    assertEquals("user@example.com", email.trim().lowercase())
                    return Result.success(Unit)
                }
            },
        )
        viewModel.onEmailChange("user@example.com")
        viewModel.showForgotPassword()
        assertEquals(LoginMode.ForgotPassword, viewModel.uiState.value.mode)

        viewModel.requestPasswordReset()
        advanceUntilIdle()

        assertEquals(1, resetCalls)
        assertFalse(viewModel.uiState.value.loading)
        assertTrue(viewModel.uiState.value.error == null)
        assertTrue(viewModel.uiState.value.info?.contains("mật khẩu tạm") == true)
    }

    private fun session() = UserSession(
        userId = "user-id",
        email = "user@example.com",
        name = "User",
        role = "user",
        status = "active",
    )
}
