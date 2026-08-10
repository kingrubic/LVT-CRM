import Foundation
import Security

final class TokenStore: CredentialStore, @unchecked Sendable {
    private let lock = NSLock()
    private var revision: Int64 = 0
    private let service = "vn.lvt.crm.auth"
    private let accessAccount = "access_token"
    private let refreshAccount = "refresh_token"

    var accessToken: String? {
        lock.lock(); defer { lock.unlock() }
        return read(account: accessAccount)
    }

    var refreshToken: String? {
        lock.lock(); defer { lock.unlock() }
        return read(account: refreshAccount)
    }

    func snapshot() -> CredentialSnapshot? {
        lock.lock(); defer { lock.unlock() }
        return currentSnapshotLocked()
    }

    func invalidatePendingWrites() -> Int64 {
        lock.lock(); defer { lock.unlock() }
        revision += 1
        return revision
    }

    func saveIfRevision(_ revision: Int64, accessToken: String, refreshToken: String) -> Bool {
        lock.lock(); defer { lock.unlock() }
        guard self.revision == revision else { return false }
        persist(accessToken: accessToken, refreshToken: refreshToken)
        return true
    }

    func replaceIfCurrent(_ expected: CredentialSnapshot, accessToken: String, refreshToken: String) -> Bool {
        lock.lock(); defer { lock.unlock() }
        guard currentSnapshotLocked() == expected else { return false }
        persist(accessToken: accessToken, refreshToken: refreshToken)
        return true
    }

    func clearIfRevision(_ revision: Int64) -> Bool {
        lock.lock(); defer { lock.unlock() }
        guard self.revision == revision else { return false }
        clearLocked()
        return true
    }

    func clearIfCurrent(_ expected: CredentialSnapshot) -> Bool {
        lock.lock(); defer { lock.unlock() }
        guard currentSnapshotLocked() == expected else { return false }
        clearLocked()
        return true
    }

    func clear() {
        lock.lock(); defer { lock.unlock() }
        clearLocked()
    }

    private func currentSnapshotLocked() -> CredentialSnapshot? {
        guard let access = read(account: accessAccount)?.nilIfBlank,
              let refresh = read(account: refreshAccount)?.nilIfBlank else { return nil }
        return CredentialSnapshot(accessToken: access, refreshToken: refresh, revision: revision)
    }

    private func persist(accessToken: String, refreshToken: String) {
        write(account: accessAccount, value: accessToken)
        write(account: refreshAccount, value: refreshToken)
    }

    private func clearLocked() {
        revision += 1
        delete(account: accessAccount)
        delete(account: refreshAccount)
    }

    private func read(account: String) -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        guard status == errSecSuccess, let data = item as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    private func write(account: String, value: String) {
        delete(account: account)
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecValueData as String: Data(value.utf8),
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
        ]
        let status = SecItemAdd(query as CFDictionary, nil)
        precondition(status == errSecSuccess, "TOKEN_PERSIST_FAILED")
    }

    private func delete(account: String) {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
        SecItemDelete(query as CFDictionary)
    }
}

private extension String {
    var nilIfBlank: String? {
        let trimmed = trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }
}
