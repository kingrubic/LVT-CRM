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
