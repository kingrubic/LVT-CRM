import Foundation

@MainActor
final class AuthRepository: ObservableObject {
    @Published private(set) var state: AuthState = .loading

    private let tokenStore: CredentialStore
    private let convex: ConvexHttpClient
    private let beforeSignOut: ((String) async -> Void)?
    private var authGeneration: Int64 = 0
    private let lock = NSLock()

    private let afterAuthenticated: (() async -> Void)?

    init(
        tokenStore: CredentialStore,
        convex: ConvexHttpClient,
        beforeSignOut: ((String) async -> Void)? = nil,
        afterAuthenticated: (() async -> Void)? = nil
    ) {
        self.tokenStore = tokenStore
        self.convex = convex
        self.beforeSignOut = beforeSignOut
        self.afterAuthenticated = afterAuthenticated
        Task { await restoreSession() }
    }

    func restoreSession() async {
        let generation = authGeneration
        guard let credentials = tokenStore.snapshot() else {
            if authGeneration == generation { state = .signedOut }
            return
        }
        do {
            if let session = try await fetchSession() {
                _ = publish(session, generation: generation, expectedCredentials: credentials)
                await afterAuthenticated?()
            } else {
                _ = clearCurrentCredentialsAndSignOut(credentials, generation: generation)
            }
        } catch let error as ConvexException
            where error.code.localizedCaseInsensitiveContains("Unauthenticated")
                || error.code.localizedCaseInsensitiveContains("Authentication") {
            _ = clearCurrentCredentialsAndSignOut(credentials, generation: generation)
        } catch {
            if authGeneration == generation, tokenStore.snapshot() == credentials {
                state = .signedOut
            }
        }
    }

    func signIn(email: String, password: String) async -> Result<UserSession, Error> {
        let normalized = email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !normalized.isEmpty, !password.isEmpty else {
            return .failure(ConvexException(code: "EMAIL_PASSWORD_REQUIRED", message: "Nhập email và mật khẩu."))
        }

        let previousCredentials = tokenStore.snapshot()
        let previousState = state
        authGeneration += 1
        let generation = authGeneration
        let credentialRevision = tokenStore.invalidatePendingWrites()
        if previousCredentials != nil, previousState.isAuthenticated {
            state = .loading
        }

        var credentialsIssued = false
        var issuedCredentials: CredentialSnapshot?

        do {
            let result = try await convex.action(
                "auth:signIn",
                args: [
                    "provider": "password",
                    "params": [
                        "email": normalized,
                        "password": password,
                        "flow": "signIn",
                    ] as [String: Any],
                ],
                authenticated: false
            )
            guard let tokens = result["tokens"] as? [String: Any],
                  let access = tokens["token"] as? String,
                  let refresh = tokens["refreshToken"] as? String
            else {
                throw ConvexException(code: "NO_TOKENS", message: "Đăng nhập không trả về token.")
            }

            credentialsIssued = authGeneration == generation
                && tokenStore.saveIfRevision(credentialRevision, accessToken: access, refreshToken: refresh)
            guard credentialsIssued else {
                return .failure(ConvexException(code: "SIGN_IN_SUPERSEDED"))
            }
            issuedCredentials = CredentialSnapshot(
                accessToken: access,
                refreshToken: refresh,
                revision: credentialRevision
            )

            guard let session = try await fetchSession() else {
                throw ConvexException(code: "NO_SESSION", message: "Không tải được phiên đăng nhập.")
            }
            guard publish(session, generation: generation) else {
                return .failure(ConvexException(code: "SIGN_IN_SUPERSEDED"))
            }
            await afterAuthenticated?()
            return .success(session)
        } catch {
            if let previousCredentials, previousState.isAuthenticated {
                rollbackAccountSwitch(
                    generation: generation,
                    credentialRevision: credentialRevision,
                    issuedCredentials: issuedCredentials,
                    previousCredentials: previousCredentials,
                    previousState: previousState
                )
            } else if credentialsIssued, let issued = issuedCredentials, invalidatesCredentials(error) {
                _ = clearCurrentCredentialsAndSignOut(issued, generation: generation)
            }
            return .failure(error)
        }
    }

    func requestPasswordReset(email: String) async -> Result<Void, Error> {
        let normalized = email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !normalized.isEmpty else {
            return .failure(ConvexException(code: "EMAIL_REQUIRED", message: "Nhập email."))
        }
        do {
            _ = try await convex.action(
                "users:requestPasswordReset",
                args: ["email": normalized],
                authenticated: false
            )
            return .success(())
        } catch {
            return .failure(error)
        }
    }

    func changePassword(newPassword: String) async -> Result<Void, Error> {
        let generation = authGeneration
        guard newPassword.count >= 8 else {
            return .failure(ConvexException(code: "PASSWORD_TOO_SHORT"))
        }
        do {
            _ = try await convex.action("users:changeOwnPassword", args: ["newPassword": newPassword])
        } catch {
            return .failure(error)
        }
        do {
            if let session = try await fetchSession() {
                _ = publish(session, generation: generation)
            } else if authGeneration == generation {
                authGeneration += 1
                tokenStore.clear()
                state = .signedOut
            }
            return .success(())
        } catch {
            return .success(())
        }
    }

    func signOut() {
        let accessToken: String?
        authGeneration += 1
        accessToken = tokenStore.accessToken
        tokenStore.clear()
        state = .signedOut
        guard let accessToken, !accessToken.isEmpty else { return }
        Task {
            if let beforeSignOut {
                await beforeSignOut(accessToken)
            }
            _ = try? await convex.actionWithToken("auth:signOut", args: [:], accessToken: accessToken)
        }
    }

    @discardableResult
    private func publish(
        _ session: UserSession,
        generation: Int64,
        expectedCredentials: CredentialSnapshot? = nil
    ) -> Bool {
        guard authGeneration == generation else { return false }
        if let expectedCredentials, tokenStore.snapshot() != expectedCredentials {
            return false
        }
        state = session.mustChangePassword ? .mustChangePassword(session) : .signedIn(session)
        return true
    }

    private func clearCurrentCredentialsAndSignOut(
        _ credentials: CredentialSnapshot,
        generation: Int64
    ) -> Bool {
        guard authGeneration == generation else { return false }
        guard tokenStore.clearIfCurrent(credentials) else { return false }
        authGeneration += 1
        state = .signedOut
        return true
    }

    private func fetchSession() async throws -> UserSession? {
        let result = try await convex.query("users:sessionContext")
        guard let user = result["user"] as? [String: Any], !user.isEmpty else { return nil }
        let department = result["department"] as? [String: Any]
        let position = result["position"] as? [String: Any]
        let email = (user["email"] as? String) ?? ""
        return UserSession(
            userId: (user["_id"] as? String) ?? "",
            email: email,
            name: ((user["name"] as? String)?.nilIfBlank) ?? email,
            role: (user["role"] as? String) ?? "user",
            status: (user["status"] as? String) ?? "active",
            mustChangePassword: (user["mustChangePassword"] as? Bool) ?? false,
            departmentName: department?["name"] as? String,
            positionName: position?["name"] as? String,
            positionLevel: position?["level"] as? Int
        )
    }

    private func invalidatesCredentials(_ error: Error) -> Bool {
        guard let error = error as? ConvexException else { return false }
        return error.code == "NO_SESSION"
            || error.code.localizedCaseInsensitiveContains("Unauthenticated")
            || error.code.localizedCaseInsensitiveContains("Authentication")
            || error.code == "UNAUTHENTICATED"
    }

    private func rollbackAccountSwitch(
        generation: Int64,
        credentialRevision: Int64,
        issuedCredentials: CredentialSnapshot?,
        previousCredentials: CredentialSnapshot,
        previousState: AuthState
    ) {
        guard authGeneration == generation else { return }
        let restored: Bool
        if issuedCredentials == nil {
            restored = tokenStore.snapshot()?.hasSameTokens(as: previousCredentials) == true
        } else if let issued = issuedCredentials {
            restored = tokenStore.replaceIfCurrent(
                issued,
                accessToken: previousCredentials.accessToken,
                refreshToken: previousCredentials.refreshToken
            )
        } else {
            restored = false
        }
        if restored {
            state = previousState
        } else if tokenStore.clearIfRevision(credentialRevision) {
            authGeneration += 1
            state = .signedOut
        }
    }
}

private extension CredentialSnapshot {
    func hasSameTokens(as other: CredentialSnapshot) -> Bool {
        accessToken == other.accessToken && refreshToken == other.refreshToken
    }
}

private extension String {
    var nilIfBlank: String? {
        let trimmed = trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }
}
