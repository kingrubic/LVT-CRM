import Foundation

extension Notification.Name {
    static let pushReceived = Notification.Name("PushReceived")
}

enum PushEvents {
    static func emit() {
        NotificationCenter.default.post(name: .pushReceived, object: nil)
    }
}
