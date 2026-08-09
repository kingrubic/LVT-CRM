import SwiftUI
import BackgroundTasks
import UserNotifications

@main
struct LvtCrmApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @StateObject private var container = AppContainer()
    @State private var pendingDestination: NotificationDestination?

    var body: some Scene {
        WindowGroup {
            RootView(container: container, pendingDestination: $pendingDestination)
                .environmentObject(container)
                .preferredColorScheme(.light)
                .onOpenURL { url in
                    if let destination = NotificationDestination.from(url: url) {
                        pendingDestination = destination
                    }
                }
                .onAppear {
                    appDelegate.container = container
                    appDelegate.onDestination = { pendingDestination = $0 }
                    BGTaskScheduler.shared.register(
                        forTaskWithIdentifier: NotificationSyncService.taskIdentifier,
                        using: nil
                    ) { task in
                        guard let refresh = task as? BGAppRefreshTask else { return }
                        Task { @MainActor in
                            container.notificationSync.handleBackgroundTask(refresh)
                        }
                    }
                }
        }
    }
}

final class AppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    weak var container: AppContainer?
    var onDestination: ((NotificationDestination) -> Void)?

    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        if let userInfo = launchOptions?[.remoteNotification] as? [AnyHashable: Any],
           let destination = NotificationDestination.from(userInfo: userInfo) {
            DispatchQueue.main.async { self.onDestination?(destination) }
        }
        return true
    }

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        Task { @MainActor in
            container?.apnsRegistrar.storeDeviceToken(deviceToken)
        }
    }

    func application(
        _ application: UIApplication,
        didReceiveRemoteNotification userInfo: [AnyHashable: Any],
        fetchCompletionHandler completionHandler: @escaping (UIBackgroundFetchResult) -> Void
    ) {
        Task { @MainActor in
            await container?.notificationSync.syncNow()
            PushEvents.emit()
            completionHandler(.newData)
        }
    }

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        if let destination = NotificationDestination.from(userInfo: response.notification.request.content.userInfo) {
            onDestination?(destination)
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
}
