import Foundation

struct CredentialSnapshot: Equatable, Sendable {
    let accessToken: String
    let refreshToken: String
    let revision: Int64
}

protocol CredentialStore: AnyObject, Sendable {
    var accessToken: String? { get }
    var refreshToken: String? { get }

    func snapshot() -> CredentialSnapshot?
    func invalidatePendingWrites() -> Int64
    func saveIfRevision(_ revision: Int64, accessToken: String, refreshToken: String) -> Bool
    func replaceIfCurrent(_ expected: CredentialSnapshot, accessToken: String, refreshToken: String) -> Bool
    func clearIfRevision(_ revision: Int64) -> Bool
    func clearIfCurrent(_ expected: CredentialSnapshot) -> Bool
    func clear()
}
