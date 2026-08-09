import Foundation

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
        guard let sourceId = value("sourceId")?.nilIfBlank else { return nil }
        return NotificationDestination(
            kind: value("kind") ?? "",
            sourceType: value("sourceType") ?? "",
            sourceId: sourceId,
            notificationKey: value("key")?.nilIfBlank
        )
    }

    static func from(userInfo: [AnyHashable: Any]) -> NotificationDestination? {
        let sourceId = (userInfo["sourceId"] as? String)?.nilIfBlank
            ?? (userInfo["lvt.notification.source_id"] as? String)?.nilIfBlank
        guard let sourceId else { return nil }
        return NotificationDestination(
            kind: (userInfo["kind"] as? String)
                ?? (userInfo["lvt.notification.kind"] as? String)
                ?? "",
            sourceType: (userInfo["sourceType"] as? String)
                ?? (userInfo["lvt.notification.source_type"] as? String)
                ?? "",
            sourceId: sourceId,
            notificationKey: (userInfo["key"] as? String)?.nilIfBlank
                ?? (userInfo["lvt.notification.key"] as? String)?.nilIfBlank
        )
    }
}

enum AppTab: String, CaseIterable, Identifiable, Hashable {
    case notifications
    case duties
    case work
    case profile

    var id: String { rawValue }

    var title: String {
        switch self {
        case .notifications: return "Thông báo"
        case .duties: return "Công tác"
        case .work: return "Công việc"
        case .profile: return "Cá nhân"
        }
    }

    var systemImage: String {
        switch self {
        case .notifications: return "bell"
        case .duties: return "briefcase"
        case .work: return "checkmark.seal"
        case .profile: return "person"
        }
    }
}

private extension String {
    var nilIfBlank: String? {
        let trimmed = trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }
}
