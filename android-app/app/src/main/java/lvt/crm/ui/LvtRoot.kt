package lvt.crm.ui

import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Notifications
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material.icons.outlined.TaskAlt
import androidx.compose.material.icons.outlined.WorkOutline
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import lvt.crm.AppContainer
import lvt.crm.R
import lvt.crm.data.auth.AuthState
import lvt.crm.ui.auth.ChangePasswordScreen
import lvt.crm.ui.auth.LoginScreen
import lvt.crm.ui.auth.LoginViewModel
import lvt.crm.ui.duties.DutiesScreen
import lvt.crm.ui.duties.DutiesViewModel
import lvt.crm.ui.home.PlaceholderScreen
import lvt.crm.ui.notifications.NotificationsScreen
import lvt.crm.ui.profile.ProfileScreen
import lvt.crm.ui.work.WorkScreen
import lvt.crm.ui.work.WorkViewModel

private object Routes {
    const val Notifications = "notifications"
    const val Duties = "duties"
    const val Work = "work"
    const val Profile = "profile"
}

@Composable
fun LvtRoot(
    container: AppContainer,
) {
    val authState by container.authRepository.state.collectAsState()
    when (val state = authState) {
        AuthState.Loading -> PlaceholderScreen(title = "LVT CRM", body = "Đang tải…")
        AuthState.SignedOut -> {
            val loginVm: LoginViewModel = viewModel(
                factory = LoginViewModel.factory(container.authRepository),
            )
            LoginScreen(viewModel = loginVm)
        }
        is AuthState.MustChangePassword -> {
            ChangePasswordScreen(
                title = "Đổi mật khẩu bắt buộc",
                subtitle = "Bạn cần đặt mật khẩu mới trước khi dùng ứng dụng.",
                authRepository = container.authRepository,
                allowCancel = false,
                onDone = {},
            )
        }
        is AuthState.SignedIn -> {
            MainShell(
                container = container,
                sessionName = state.session.name,
                sessionEmail = state.session.email,
                role = state.session.role,
                departmentName = state.session.departmentName,
                positionName = state.session.positionName,
                onSignOut = container.authRepository::signOut,
            )
        }
    }
}

@Composable
private fun MainShell(
    container: AppContainer,
    sessionName: String,
    sessionEmail: String,
    role: String,
    departmentName: String?,
    positionName: String?,
    onSignOut: () -> Unit,
) {
    val navController = rememberNavController()
    val backStack by navController.currentBackStackEntryAsState()
    val current = backStack?.destination?.route ?: Routes.Notifications

    val tabs = listOf(
        Triple(Routes.Notifications, R.string.nav_notifications, Icons.Outlined.Notifications),
        Triple(Routes.Duties, R.string.nav_duties, Icons.Outlined.WorkOutline),
        Triple(Routes.Work, R.string.nav_work, Icons.Outlined.TaskAlt),
        Triple(Routes.Profile, R.string.nav_profile, Icons.Outlined.Person),
    )

    Scaffold(
        bottomBar = {
            NavigationBar {
                tabs.forEach { (route, labelRes, icon) ->
                    NavigationBarItem(
                        selected = current == route,
                        onClick = {
                            navController.navigate(route) {
                                popUpTo(navController.graph.findStartDestination().id) {
                                    saveState = true
                                }
                                launchSingleTop = true
                                restoreState = true
                            }
                        },
                        icon = { Icon(icon, contentDescription = null) },
                        label = { Text(stringResource(labelRes)) },
                    )
                }
            }
        },
    ) { padding ->
        NavHost(
            navController = navController,
            startDestination = Routes.Notifications,
            modifier = Modifier.padding(padding),
        ) {
            composable(Routes.Notifications) { NotificationsScreen() }
            composable(Routes.Duties) {
                val vm: DutiesViewModel = viewModel(
                    factory = DutiesViewModel.factory(container.dutiesRepository),
                )
                DutiesScreen(viewModel = vm)
            }
            composable(Routes.Work) {
                val vm: WorkViewModel = viewModel(
                    factory = WorkViewModel.factory(container.workRepository),
                )
                WorkScreen(viewModel = vm)
            }
            composable(Routes.Profile) {
                ProfileScreen(
                    name = sessionName,
                    email = sessionEmail,
                    role = role,
                    departmentName = departmentName,
                    positionName = positionName,
                    authRepository = container.authRepository,
                    onSignOut = onSignOut,
                )
            }
        }
    }
}
