import Foundation

@MainActor
final class AppContainer {
    let tokenStore: TokenStore
    let convex: ConvexHttpClient
    let authRepository: AuthRepository
    let sessionsRepository: SessionsRepository
    let notificationsRepository: NotificationsRepository
    let dutiesRepository: DutiesRepository
    let workRepository: WorkRepository
    let notificationSync: NotificationSyncService
    let apnsRegistrar: APNsTokenRegistrar

    init() {
        let tokenStore = TokenStore()
        self.tokenStore = tokenStore
        let convex = ConvexHttpClient(
            baseURL: ConvexConfig.url,
            tokenProvider: { tokenStore.accessToken },
            refreshCredentialsProvider: { tokenStore.snapshot() },
            onTokensRefreshed: { expected, access, refresh in
                tokenStore.replaceIfCurrent(expected, accessToken: access, refreshToken: refresh)
            }
        )
        self.convex = convex
        sessionsRepository = SessionsRepository(convex: convex)
        let notificationsRepository = NotificationsRepository(convex: convex)
        self.notificationsRepository = notificationsRepository
        dutiesRepository = DutiesRepository(convex: convex)
        workRepository = WorkRepository(convex: convex, tokenProvider: { tokenStore.accessToken })
        notificationSync = NotificationSyncService(
            tokenStore: tokenStore,
            repository: notificationsRepository
        )
        let apnsRegistrar = APNsTokenRegistrar(tokenStore: tokenStore, convex: convex)
        self.apnsRegistrar = apnsRegistrar
        authRepository = AuthRepository(
            tokenStore: tokenStore,
            convex: convex,
            beforeSignOut: { accessToken in
                await apnsRegistrar.unregister(accessToken: accessToken)
            }
        )
    }
}
