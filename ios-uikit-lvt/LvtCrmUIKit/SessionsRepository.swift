import Foundation
import UIKit

struct DeviceSession: Equatable, Sendable {
    let sessionId: String
    let isCurrent: Bool
    let deviceName: String
    let platformLabel: String
    let clientKind: String
    let lastActiveAt: TimeInterval
}

actor SessionsRepository {
    private let convex: ConvexHttpClient

    init(convex: ConvexHttpClient) {
        self.convex = convex
    }

    func registerCurrentDevice(pushToken: String? = nil) async {
        let (deviceName, appVersion) = await MainActor.run {
            let name = UIDevice.current.name.trimmingCharacters(in: .whitespacesAndNewlines)
            return (name.isEmpty ? "iPhone" : name, UIDevice.current.systemVersion)
        }
        var args: [String: Any] = [
            "deviceName": deviceName,
            "platformLabel": "LVT CRM iOS",
            "clientKind": "ios",
            "appVersion": appVersion,
        ]
        if let pushToken, !pushToken.isEmpty {
            args["pushToken"] = pushToken
        }
        _ = try? await convex.mutation("sessions:registerCurrent", args: args)
    }

    func listMine() async throws -> [DeviceSession] {
        let result = try await convex.query("sessions:listMine")
        let items = (result["items"] as? [[String: Any]]) ?? []
        return items.compactMap { row in
            guard let sessionId = row["sessionId"] as? String, !sessionId.isEmpty else { return nil }
            return DeviceSession(
                sessionId: sessionId,
                isCurrent: (row["isCurrent"] as? Bool) ?? false,
                deviceName: (row["deviceName"] as? String) ?? "iPhone",
                platformLabel: (row["platformLabel"] as? String) ?? "LVT CRM iOS",
                clientKind: (row["clientKind"] as? String) ?? "ios",
                lastActiveAt: (row["lastActiveAt"] as? Double) ?? 0
            )
        }
    }

    func revoke(sessionId: String) async throws {
        _ = try await convex.action("sessions:revokeMine", args: ["sessionId": sessionId])
    }

    func revokeAllOthers() async throws {
        _ = try await convex.action("sessions:revokeAllOthers", args: [:])
    }
}
