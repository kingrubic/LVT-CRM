package lvt.crm.ui

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Notifications
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material.icons.outlined.TaskAlt
import androidx.compose.material.icons.outlined.WorkOutline
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.core.content.ContextCompat
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import lvt.crm.AppContainer
import lvt.crm.R
import lvt.crm.data.auth.AuthState
import lvt.crm.data.notifications.NotificationItem
import lvt.crm.push.NotificationDestination
import lvt.crm.ui.auth.ChangePasswordScreen
import lvt.crm.ui.auth.LoginScreen
import lvt.crm.ui.auth.LoginViewModel
import lvt.crm.ui.duties.DutiesScreen
import lvt.crm.ui.duties.DutiesViewModel
import lvt.crm.ui.home.PlaceholderScreen
import lvt.crm.ui.notifications.NotificationsScreen
import lvt.crm.ui.notifications.NotificationsViewModel
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
    notificationDestination: NotificationDestination?,
    onNotificationDestinationHandled: () -> Unit,
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
            NotificationPermissionAndSync(container)
            MainShell(
                container = container,
                sessionName = state.session.name,
                sessionEmail = state.session.email,
                role = state.session.role,
                departmentName = state.session.departmentName,
                positionName = state.session.positionName,
                notificationDestination = notificationDestination,
                onNotificationDestinationHandled = onNotificationDestinationHandled,
                onSignOut = {
                    container.notificationScheduler.cancel()
                    container.authRepository.signOut()
                },
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
    notificationDestination: NotificationDestination?,
    onNotificationDestinationHandled: () -> Unit,
    onSignOut: () -> Unit,
) {
    val navController = rememberNavController()
    val backStack by navController.currentBackStackEntryAsState()
    val current = backStack?.destination?.route ?: Routes.Notifications
    val notificationsViewModel: NotificationsViewModel = viewModel(
        factory = NotificationsViewModel.factory(container.notificationsRepository),
    )
    val notificationState by notificationsViewModel.uiState.collectAsState()
    var focusTarget by remember { mutableStateOf<NotificationDestination?>(null) }

    val tabs = listOf(
        Triple(Routes.Notifications, R.string.nav_notifications, Icons.Outlined.Notifications),
        Triple(Routes.Duties, R.string.nav_duties, Icons.Outlined.WorkOutline),
        Triple(Routes.Work, R.string.nav_work, Icons.Outlined.TaskAlt),
        Triple(Routes.Profile, R.string.nav_profile, Icons.Outlined.Person),
    )

    fun openNotification(item: NotificationItem) {
        val destination = NotificationDestination(
            kind = item.kind,
            sourceType = item.sourceType,
            sourceId = item.sourceId,
            notificationKey = item.key,
        )
        focusTarget = destination
        navController.navigate(destination.route) {
            launchSingleTop = true
        }
    }

    LaunchedEffect(notificationDestination) {
        val destination = notificationDestination ?: return@LaunchedEffect
        focusTarget = destination
        destination.notificationKey?.let { key ->
            runCatching { container.notificationsRepository.markRead(key) }
            notificationsViewModel.refresh()
        }
        navController.navigate(destination.route) {
            launchSingleTop = true
        }
        onNotificationDestinationHandled()
    }

    Scaffold(
        bottomBar = {
            NavigationBar {
                tabs.forEach { (route, labelRes, icon) ->
                    NavigationBarItem(
                        selected = current == route,
                        onClick = {
                            focusTarget = null
                            navController.navigate(route) {
                                popUpTo(navController.graph.findStartDestination().id) {
                                    saveState = true
                                }
                                launchSingleTop = true
                                restoreState = true
                            }
                        },
                        icon = {
                            if (route == Routes.Notifications && notificationState.unreadCount > 0) {
                                BadgedBox(
                                    badge = {
                                        Badge {
                                            Text(
                                                if (notificationState.unreadCount > 99) {
                                                    "99+"
                                                } else {
                                                    notificationState.unreadCount.toString()
                                                },
                                            )
                                        }
                                    },
                                ) {
                                    Icon(icon, contentDescription = null)
                                }
                            } else {
                                Icon(icon, contentDescription = null)
                            }
                        },
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
            composable(Routes.Notifications) {
                NotificationsScreen(
                    viewModel = notificationsViewModel,
                    onOpenItem = ::openNotification,
                )
            }
            composable(Routes.Duties) {
                val vm: DutiesViewModel = viewModel(
                    factory = DutiesViewModel.factory(container.dutiesRepository),
                )
                DutiesScreen(
                    viewModel = vm,
                    focusId = focusTarget
                        ?.takeIf { it.route == Routes.Duties }
                        ?.sourceId,
                )
            }
            composable(Routes.Work) {
                val vm: WorkViewModel = viewModel(
                    factory = WorkViewModel.factory(container.workRepository),
                )
                WorkScreen(
                    viewModel = vm,
                    focusId = focusTarget
                        ?.takeIf { it.route == Routes.Work }
                        ?.sourceId,
                )
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

@Composable
private fun NotificationPermissionAndSync(container: AppContainer) {
    val context = LocalContext.current
    val permissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) {
        container.notificationScheduler.syncNow()
    }

    LaunchedEffect(container) {
        container.notificationScheduler.schedule()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(
                context,
                Manifest.permission.POST_NOTIFICATIONS,
            ) != PackageManager.PERMISSION_GRANTED
        ) {
            val preferences = context.getSharedPreferences(
                "lvt_notification_permission",
                Context.MODE_PRIVATE,
            )
            if (!preferences.getBoolean("requested", false)) {
                preferences.edit().putBoolean("requested", true).apply()
                permissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
            }
        }
    }
}
