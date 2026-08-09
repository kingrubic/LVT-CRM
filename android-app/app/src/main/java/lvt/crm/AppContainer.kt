package lvt.crm

import android.content.Context
import lvt.crm.data.auth.AuthRepository
import lvt.crm.data.auth.TokenStore
import lvt.crm.data.convex.ConvexConfig
import lvt.crm.data.convex.ConvexHttpClient
import lvt.crm.data.duties.DutiesRepository
import lvt.crm.data.notifications.NotificationsRepository
import lvt.crm.data.work.WorkRepository
import lvt.crm.push.NotificationScheduler
import lvt.crm.push.FcmTokenRegistrar

class AppContainer(context: Context) {
    val appContext = context.applicationContext
    val tokenStore = TokenStore(appContext)

    val convex = ConvexHttpClient(
        baseUrl = ConvexConfig.url,
        tokenProvider = { tokenStore.accessToken },
        refreshCredentialsProvider = { tokenStore.snapshot() },
        onTokensRefreshed = { expected, access, refresh ->
            tokenStore.replaceIfCurrent(expected, access, refresh)
        },
    )

    val fcmTokenRegistrar = FcmTokenRegistrar(appContext, tokenStore, convex)
    val authRepository = AuthRepository(
        tokenStore,
        convex,
        beforeSignOut = { accessToken -> fcmTokenRegistrar.unregister(accessToken) },
    )
    val dutiesRepository = DutiesRepository(convex)
    val notificationsRepository = NotificationsRepository(convex)
    val workRepository = WorkRepository(convex)
    val notificationScheduler = NotificationScheduler(appContext)
}
