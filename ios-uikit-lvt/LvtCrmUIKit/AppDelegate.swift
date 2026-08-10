import UIKit
import UserNotifications
import BackgroundTasks

extension Notification.Name {
    static let openNotificationDestination = Notification.Name("OpenNotificationDestination")
}

@main
final class AppDelegate: UIResponder, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    let container = AppContainer()
    private(set) var pendingDestination: NotificationDestination?

    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        BGTaskScheduler.shared.register(
            forTaskWithIdentifier: NotificationSyncService.taskIdentifier,
            using: nil
        ) { [weak self] task in
            guard let refresh = task as? BGAppRefreshTask else { return }
            Task { @MainActor in
                self?.container.notificationSync.handleBackgroundTask(refresh)
            }
        }
        if let userInfo = launchOptions?[.remoteNotification] as? [AnyHashable: Any] {
            pendingDestination = NotificationDestination.from(userInfo: userInfo)
        }
        return true
    }

    func application(
        _ application: UIApplication,
        didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
    ) {
        container.apnsRegistrar.storeDeviceToken(deviceToken)
    }

    func application(
        _ application: UIApplication,
        didReceiveRemoteNotification userInfo: [AnyHashable: Any],
        fetchCompletionHandler completionHandler: @escaping (UIBackgroundFetchResult) -> Void
    ) {
        Task { @MainActor in
            await container.notificationSync.syncNow()
            PushEvents.emit()
            completionHandler(.newData)
        }
    }

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        if let destination = NotificationDestination.from(
            userInfo: response.notification.request.content.userInfo
        ) {
            NotificationCenter.default.post(name: .openNotificationDestination, object: destination)
        }
        completionHandler()
    }

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        PushEvents.emit()
        completionHandler([.banner, .sound, .badge])
    }

    func application(
        _ application: UIApplication,
        configurationForConnecting connectingSceneSession: UISceneSession,
        options: UIScene.ConnectionOptions
    ) -> UISceneConfiguration {
        let configuration = UISceneConfiguration(
            name: "Default Configuration",
            sessionRole: connectingSceneSession.role
        )
        configuration.delegateClass = SceneDelegate.self
        return configuration
    }
}
