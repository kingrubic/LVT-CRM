import Foundation

@MainActor
final class AppContainer: ObservableObject {
    let tokenStore: TokenStore
    let convex: ConvexHttpClient
    let authRepository: AuthRepository
    let sessionsRepository: SessionsRepository
    let dutiesRepository: DutiesRepository
    let workRepository: WorkRepository
    let notificationsRepository: NotificationsRepository
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

        let notificationsRepository = NotificationsRepository(convex: convex)
        self.notificationsRepository = notificationsRepository
        self.dutiesRepository = DutiesRepository(convex: convex)
        self.workRepository = WorkRepository(convex: convex)

        let sessionsRepository = SessionsRepository(convex: convex)
        self.sessionsRepository = sessionsRepository

        let apnsRegistrar = APNsTokenRegistrar(tokenStore: tokenStore, convex: convex)
        self.apnsRegistrar = apnsRegistrar

        self.authRepository = AuthRepository(
            tokenStore: tokenStore,
            convex: convex,
            beforeSignOut: { accessToken in
                await apnsRegistrar.unregister(accessToken: accessToken)
            },
            afterAuthenticated: {
                await sessionsRepository.registerCurrentDevice()
            }
        )

        self.notificationSync = NotificationSyncService(
            tokenStore: tokenStore,
            repository: notificationsRepository
        )
    }
}
