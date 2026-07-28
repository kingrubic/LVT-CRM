package lvt.crm

import android.content.Context
import lvt.crm.data.auth.AuthRepository
import lvt.crm.data.auth.TokenStore
import lvt.crm.data.convex.ConvexConfig
import lvt.crm.data.convex.ConvexHttpClient
import lvt.crm.data.duties.DutiesRepository
import lvt.crm.data.work.WorkRepository

class AppContainer(context: Context) {
    private val appContext = context.applicationContext
    val tokenStore = TokenStore(appContext)

    val convex = ConvexHttpClient(
        baseUrl = ConvexConfig.url,
        tokenProvider = { tokenStore.accessToken },
        refreshTokenProvider = { tokenStore.refreshToken },
        onTokensRefreshed = { access, refresh -> tokenStore.save(access, refresh) },
    )

    val authRepository = AuthRepository(tokenStore, convex)
    val dutiesRepository = DutiesRepository(convex)
    val workRepository = WorkRepository(convex)
}
