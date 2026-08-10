import Foundation
import UIKit

@MainActor
final class APNsTokenRegistrar {
    private let tokenStore: CredentialStore
    private let convex: ConvexHttpClient
    private let defaultsKey = "lvt_apns_token"

    init(tokenStore: CredentialStore, convex: ConvexHttpClient) {
        self.tokenStore = tokenStore
        self.convex = convex
    }

    func storeDeviceToken(_ tokenData: Data) {
        let token = tokenData.map { String(format: "%02.2hhx", $0) }.joined()
        UserDefaults.standard.set(token, forKey: defaultsKey)
        Task { await sync() }
    }

    func sync() async {
        guard tokenStore.accessToken != nil,
              let token = UserDefaults.standard.string(forKey: defaultsKey),
              !token.isEmpty else { return }
        _ = try? await convex.mutation(
            "push:registerToken",
            args: [
                "token": token,
                "appId": ConvexConfig.appId,
            ]
        )
    }

    func unregister(accessToken: String) async {
        guard let token = UserDefaults.standard.string(forKey: defaultsKey), !token.isEmpty else { return }
        _ = try? await convex.mutationWithToken(
            "push:unregisterToken",
            args: ["token": token],
            accessToken: accessToken
        )
    }

    func registerForRemoteNotifications() {
        UIApplication.shared.registerForRemoteNotifications()
    }
}
