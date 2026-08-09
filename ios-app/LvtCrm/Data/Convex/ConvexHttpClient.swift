import Foundation

struct ConvexException: Error, LocalizedError {
    let code: String
    let message: String

    var errorDescription: String? { message }

    init(code: String, message: String? = nil) {
        self.code = code
        self.message = message ?? ConvexHttpClient.humanize(code)
    }
}

actor ConvexHttpClient {
    private let baseURL: String
    private let tokenProvider: @Sendable () -> String?
    private let refreshCredentialsProvider: @Sendable () -> CredentialSnapshot?
    private let onTokensRefreshed: @Sendable (CredentialSnapshot, String, String) -> Bool
    private let session: URLSession
    private var isRefreshing = false

    init(
        baseURL: String,
        tokenProvider: @escaping @Sendable () -> String?,
        refreshCredentialsProvider: @escaping @Sendable () -> CredentialSnapshot?,
        onTokensRefreshed: @escaping @Sendable (CredentialSnapshot, String, String) -> Bool
    ) {
        self.baseURL = baseURL.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        self.tokenProvider = tokenProvider
        self.refreshCredentialsProvider = refreshCredentialsProvider
        self.onTokensRefreshed = onTokensRefreshed
        let config = URLSessionConfiguration.ephemeral
        config.timeoutIntervalForRequest = 45
        config.timeoutIntervalForResource = 60
        self.session = URLSession(configuration: config)
    }

    func query(_ path: String, args: [String: Any] = [:], authenticated: Bool = true) async throws -> [String: Any] {
        try await call(kind: "query", path: path, args: args, authenticated: authenticated)
    }

    func mutation(_ path: String, args: [String: Any] = [:], authenticated: Bool = true) async throws -> [String: Any] {
        try await call(kind: "mutation", path: path, args: args, authenticated: authenticated)
    }

    func action(_ path: String, args: [String: Any] = [:], authenticated: Bool = true) async throws -> [String: Any] {
        try await call(kind: "action", path: path, args: args, authenticated: authenticated)
    }

    func mutationWithToken(_ path: String, args: [String: Any], accessToken: String) async throws -> [String: Any] {
        try await call(
            kind: "mutation",
            path: path,
            args: args,
            authenticated: true,
            accessTokenOverride: accessToken
        )
    }

    func actionWithToken(_ path: String, args: [String: Any], accessToken: String) async throws -> [String: Any] {
        try await call(
            kind: "action",
            path: path,
            args: args,
            authenticated: true,
            accessTokenOverride: accessToken
        )
    }

    private func call(
        kind: String,
        path: String,
        args: [String: Any],
        authenticated: Bool,
        retried: Bool = false,
        accessTokenOverride: String? = nil
    ) async throws -> [String: Any] {
        guard let url = URL(string: "\(baseURL)/api/\(kind)") else {
            throw ConvexException(code: "INVALID_URL")
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        let body: [String: Any] = [
            "path": path,
            "args": args,
            "format": "json",
        ]
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let requestToken = authenticated ? (accessTokenOverride ?? tokenProvider()) : nil
        if authenticated, let token = requestToken, !token.isEmpty {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        let (data, response) = try await session.data(for: request)
        let statusCode = (response as? HTTPURLResponse)?.statusCode ?? 0

        if authenticated, accessTokenOverride == nil, statusCode == 401, !retried {
            if let refreshed = await tryRefresh(failedAccessToken: requestToken) {
                return try await call(
                    kind: kind,
                    path: path,
                    args: args,
                    authenticated: true,
                    retried: true,
                    accessTokenOverride: refreshed
                )
            }
        }

        let json = try parseJSONObject(data)
        if (json["status"] as? String) == "success" {
            return unwrapValue(json["value"])
        }

        let errorMessage = (json["errorMessage"] as? String)?.nilIfBlank
            ?? (json["error"] as? String)?.nilIfBlank
            ?? "CONVEX_ERROR"
        let unauthorized = statusCode == 401
            || errorMessage.localizedCaseInsensitiveContains("Unauthenticated")
            || errorMessage.localizedCaseInsensitiveContains("Authentication")

        if authenticated, accessTokenOverride == nil, unauthorized, !retried {
            if let refreshed = await tryRefresh(failedAccessToken: requestToken) {
                return try await call(
                    kind: kind,
                    path: path,
                    args: args,
                    authenticated: true,
                    retried: true,
                    accessTokenOverride: refreshed
                )
            }
        }

        throw ConvexException(code: Self.extractCode(errorMessage), message: Self.humanize(errorMessage))
    }

    private func tryRefresh(failedAccessToken: String?) async -> String? {
        guard !isRefreshing else { return nil }
        isRefreshing = true
        defer { isRefreshing = false }

        guard let expected = refreshCredentialsProvider(),
              let failed = failedAccessToken, !failed.isEmpty,
              expected.accessToken == failed
        else { return nil }

        do {
            guard let url = URL(string: "\(baseURL)/api/action") else { return nil }
            var request = URLRequest(url: url)
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            let body: [String: Any] = [
                "path": "auth:signIn",
                "args": ["refreshToken": expected.refreshToken],
                "format": "json",
            ]
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
            let (data, _) = try await session.data(for: request)
            let json = try parseJSONObject(data)
            guard (json["status"] as? String) == "success",
                  let value = json["value"] as? [String: Any],
                  let tokens = value["tokens"] as? [String: Any],
                  let access = tokens["token"] as? String,
                  let refresh = tokens["refreshToken"] as? String
            else { return nil }

            let persisted = onTokensRefreshed(expected, access, refresh)
            return persisted ? access : nil
        } catch {
            return nil
        }
    }

    private func unwrapValue(_ value: Any?) -> [String: Any] {
        switch value {
        case nil, is NSNull:
            return [:]
        case let object as [String: Any]:
            return object
        case let array as [Any]:
            return ["items": array]
        case let bool as Bool:
            return ["ok": bool]
        case let number as NSNumber:
            return ["value": number]
        case let string as String:
            return ["value": string]
        default:
            return ["value": "\(value!)"]
        }
    }

    private func parseJSONObject(_ data: Data) throws -> [String: Any] {
        guard let object = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            throw ConvexException(code: "INVALID_JSON", message: "Phản hồi Convex không hợp lệ.")
        }
        return object
    }

    static func extractCode(_ message: String) -> String {
        let known = [
            "InvalidAccountId", "InvalidSecret", "Invalid credentials", "USER_NOT_ACTIVE",
            "PASSWORD_TOO_SHORT", "PASSWORD_CHANGE_FAILED", "PASSWORD_CHANGED_SYNC_PENDING",
            "PASSWORD_CHANGE_REQUIRED", "PASSWORD_RESET_FAILED", "PASSWORD_RESET_EMAIL_FAILED",
            "MAIL_NOT_CONFIGURED", "MAIL_AUTH_FAILED", "PUBLIC_SIGNUP_DISABLED", "INVALID_EMAIL",
            "INVALID_AUTH_FLOW", "FORBIDDEN", "UNAUTHENTICATED", "ATTENDANCE_OUTSIDE_WINDOW",
            "ATTENDANCE_CONFIRMATION_DISABLED", "NOT_A_PARTICIPANT", "QUALITY_PERCENT_REQUIRED",
        ]
        return known.first { message.localizedCaseInsensitiveContains($0) } ?? message
    }

    static func humanize(_ message: String) -> String {
        let code = extractCode(message)
        switch true {
        case code.localizedCaseInsensitiveContains("Invalid"),
             code.localizedCaseInsensitiveContains("credentials"):
            return "Email hoặc mật khẩu không đúng."
        case code == "USER_NOT_ACTIVE":
            return "Tài khoản chưa được kích hoạt hoặc đã bị khóa."
        case code == "PASSWORD_TOO_SHORT":
            return "Mật khẩu phải có ít nhất 8 ký tự."
        case code == "PASSWORD_CHANGE_FAILED":
            return "Không đổi được mật khẩu. Thử lại sau."
        case code == "PASSWORD_CHANGED_SYNC_PENDING":
            return "Mật khẩu đã đổi nhưng hồ sơ chưa đồng bộ. Đăng nhập lại."
        case code == "PASSWORD_CHANGE_REQUIRED":
            return "Bạn cần đổi mật khẩu trước khi tiếp tục."
        case code == "PASSWORD_RESET_FAILED":
            return "Không thể đặt lại mật khẩu. Thử lại sau."
        case code == "PASSWORD_RESET_EMAIL_FAILED":
            return "Đã tạo mật khẩu tạm nhưng chưa gửi được email. Liên hệ quản trị viên."
        case code == "MAIL_NOT_CONFIGURED", code == "MAIL_AUTH_FAILED":
            return "Hệ thống chưa gửi được email. Liên hệ quản trị viên."
        case code == "INVALID_EMAIL":
            return "Email không hợp lệ."
        case code == "ATTENDANCE_OUTSIDE_WINDOW":
            return "Chỉ xác nhận trong thời gian công tác đang diễn ra."
        case code == "ATTENDANCE_CONFIRMATION_DISABLED":
            return "Hệ thống đang tắt xác nhận tham dự."
        case code == "NOT_A_PARTICIPANT":
            return "Bạn không nằm trong danh sách tham dự."
        case code == "QUALITY_PERCENT_REQUIRED":
            return "Cần nhập phần trăm chất lượng."
        case code.localizedCaseInsensitiveContains("FORBIDDEN"):
            return "Bạn không có quyền thực hiện thao tác này."
        default:
            return String(code.prefix(180))
        }
    }
}

private extension String {
    var nilIfBlank: String? {
        let trimmed = trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }
}
