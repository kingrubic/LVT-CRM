import Foundation

struct NotificationItem: Identifiable, Equatable, Sendable {
    var id: String { key }
    let key: String
    let kind: String
    let sourceType: String
    let sourceId: String
    let title: String
    let description: String
    let dueAt: Int64
    let milestoneHours: Int
    let milestoneLabel: String
    var read: Bool
}

struct NotificationSettings: Equatable, Sendable {
    let dutiesEnabled: Bool
    let workEnabled: Bool
    let milestonesHours: [Int]
}

struct NotificationsSnapshot: Equatable, Sendable {
    let items: [NotificationItem]
    let unreadCount: Int
    let canDelete: Bool
    let settings: NotificationSettings
}

enum AppTab: Hashable {
    case notifications
    case duties
    case work
    case profile
}

struct NotificationDestination: Equatable, Sendable, Hashable {
    let kind: String
    let sourceType: String
    let sourceId: String
    let notificationKey: String?

    var route: AppTab {
        kind == "duty" ? .duties : .work
    }

    static func from(url: URL) -> NotificationDestination? {
        guard url.scheme == "lvtcrm", url.host == "notification" else { return nil }
        let items = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? []
        func value(_ name: String) -> String? {
            items.first(where: { $0.name == name })?.value
        }
        guard let sourceId = value("sourceId")?.notificationValue else { return nil }
        return NotificationDestination(
            kind: value("kind") ?? "",
            sourceType: value("sourceType") ?? "",
            sourceId: sourceId,
            notificationKey: value("key")?.notificationValue
        )
    }

    static func from(userInfo: [AnyHashable: Any]) -> NotificationDestination? {
        let sourceId = (userInfo["sourceId"] as? String)?.notificationValue
            ?? (userInfo["lvt.notification.source_id"] as? String)?.notificationValue
        guard let sourceId else { return nil }
        return NotificationDestination(
            kind: (userInfo["kind"] as? String)
                ?? (userInfo["lvt.notification.kind"] as? String)
                ?? "",
            sourceType: (userInfo["sourceType"] as? String)
                ?? (userInfo["lvt.notification.source_type"] as? String)
                ?? "",
            sourceId: sourceId,
            notificationKey: (userInfo["key"] as? String)?.notificationValue
                ?? (userInfo["lvt.notification.key"] as? String)?.notificationValue
        )
    }
}

private extension String {
    var notificationValue: String? {
        let trimmed = trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }
}
