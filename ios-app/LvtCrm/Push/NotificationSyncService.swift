import Foundation
import BackgroundTasks

@MainActor
final class NotificationSyncService {
    static let taskIdentifier = "vn.lvt.crm.notifications.refresh"
    private static let preferencesKey = "lvt_notification_delivery_keys"
    private static let maxPerSync = 5

    private let tokenStore: CredentialStore
    private let repository: NotificationsRepository
    private var isSyncing = false

    init(tokenStore: CredentialStore, repository: NotificationsRepository) {
        self.tokenStore = tokenStore
        self.repository = repository
    }

    func schedule() {
        let request = BGAppRefreshTaskRequest(identifier: Self.taskIdentifier)
        request.earliestBeginDate = Date(timeIntervalSinceNow: 15 * 60)
        try? BGTaskScheduler.shared.submit(request)
    }

    func cancel() {
        BGTaskScheduler.shared.cancel(taskRequestWithIdentifier: Self.taskIdentifier)
        NotificationCenterService.cancelAll()
        UserDefaults.standard.removeObject(forKey: Self.preferencesKey)
    }

    func syncNow() async {
        guard !isSyncing else { return }
        isSyncing = true
        defer { isSyncing = false }

        guard let session = tokenStore.snapshot() else { return }
        do {
            let snapshot = try await repository.feed()
            let unread = snapshot.items.filter { !$0.read }
            let unreadKeys = Set(unread.map(\.key))
            var delivered = Set(UserDefaults.standard.stringArray(forKey: Self.preferencesKey) ?? [])
            delivered = delivered.intersection(unreadKeys)
            guard tokenStore.snapshot() == session else { return }
            UserDefaults.standard.set(Array(delivered), forKey: Self.preferencesKey)

            var newlyDelivered = 0
            for item in unread where !delivered.contains(item.key) {
                guard newlyDelivered < Self.maxPerSync else { break }
                guard tokenStore.snapshot() == session else { return }
                let shown = await NotificationCenterService.show(item)
                guard shown, tokenStore.snapshot() == session else { return }
                delivered.insert(item.key)
                newlyDelivered += 1
                UserDefaults.standard.set(Array(delivered), forKey: Self.preferencesKey)
            }
            PushEvents.emit()
        } catch {
            // Best-effort background sync.
        }
        schedule()
    }

    func handleBackgroundTask(_ task: BGAppRefreshTask) {
        schedule()
        let syncTask = Task {
            await syncNow()
            task.setTaskCompleted(success: true)
        }
        task.expirationHandler = {
            syncTask.cancel()
            task.setTaskCompleted(success: false)
        }
    }
}
