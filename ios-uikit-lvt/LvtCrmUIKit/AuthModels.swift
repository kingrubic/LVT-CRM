import Foundation

struct UserSession: Equatable, Sendable {
    let userId: String
    let email: String
    let name: String
    let role: String
    let status: String
    let mustChangePassword: Bool
    let departmentName: String?
    let positionName: String?
    let positionLevel: Int?
    let hasAvatar: Bool
    let avatarVersion: String?

    var isOperationalManager: Bool {
        role == "admin" || role == "moderator"
    }

    var roleLabel: String {
        switch role {
        case "admin": return "Quản trị viên"
        case "moderator": return "Điều phối viên"
        default: return "Nhân sự"
        }
    }
}

extension UserSession {
    init?(sessionContext result: [String: Any]) {
        guard let user = result["user"] as? [String: Any], !user.isEmpty else { return nil }
        let department = result["department"] as? [String: Any]
        let position = result["position"] as? [String: Any]
        let email = (user["email"] as? String) ?? ""
        let rawName = (user["name"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        self.init(
            userId: (user["_id"] as? String) ?? "",
            email: email,
            name: rawName.isEmpty ? email : rawName,
            role: (user["role"] as? String) ?? "user",
            status: (user["status"] as? String) ?? "active",
            mustChangePassword: (user["mustChangePassword"] as? Bool) ?? false,
            departmentName: department?["name"] as? String,
            positionName: position?["name"] as? String,
            positionLevel: position?["level"] as? Int,
            hasAvatar: (user["hasAvatar"] as? Bool) ?? false,
            avatarVersion: user["avatarVersion"] as? String
        )
    }
}

enum AuthState: Equatable, Sendable {
    case loading
    case signedOut
    case signedIn(UserSession)
    case mustChangePassword(UserSession)

    var isAuthenticated: Bool {
        switch self {
        case .signedIn, .mustChangePassword: return true
        default: return false
        }
    }

    var session: UserSession? {
        switch self {
        case .signedIn(let session), .mustChangePassword(let session): return session
        default: return nil
        }
    }
}
