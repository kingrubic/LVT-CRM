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
        let configuration = URLSessionConfiguration.ephemeral
        configuration.timeoutIntervalForRequest = 45
        configuration.timeoutIntervalForResource = 60
        session = URLSession(configuration: configuration)
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

    func actionWithToken(_ path: String, args: [String: Any], accessToken: String) async throws -> [String: Any] {
        try await call(kind: "action", path: path, args: args, authenticated: true, accessTokenOverride: accessToken)
    }

    func mutationWithToken(_ path: String, args: [String: Any], accessToken: String) async throws -> [String: Any] {
        try await call(kind: "mutation", path: path, args: args, authenticated: true, accessTokenOverride: accessToken)
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
        request.httpBody = try JSONSerialization.data(withJSONObject: [
            "path": path,
            "args": args,
            "format": "json",
        ])

        let requestToken = authenticated ? (accessTokenOverride ?? tokenProvider()) : nil
        if authenticated, let requestToken, !requestToken.isEmpty {
            request.setValue("Bearer \(requestToken)", forHTTPHeaderField: "Authorization")
        }

        let (data, response) = try await session.data(for: request)
        let statusCode = (response as? HTTPURLResponse)?.statusCode ?? 0
        if authenticated, accessTokenOverride == nil, statusCode == 401, !retried,
           let refreshed = await tryRefresh(failedAccessToken: requestToken) {
            return try await call(
                kind: kind, path: path, args: args, authenticated: true,
                retried: true, accessTokenOverride: refreshed
            )
        }

        let json = try parseJSONObject(data)
        if (json["status"] as? String) == "success" {
            return unwrapValue(json["value"])
        }
        let errorMessage = (json["errorData"] as? String)?.nilIfBlank
            ?? (json["errorMessage"] as? String)?.nilIfBlank
            ?? (json["error"] as? String)?.nilIfBlank
            ?? "CONVEX_ERROR"
        let unauthorized = statusCode == 401
            || errorMessage.localizedCaseInsensitiveContains("Unauthenticated")
            || errorMessage.localizedCaseInsensitiveContains("Authentication")
        if authenticated, accessTokenOverride == nil, unauthorized, !retried,
           let refreshed = await tryRefresh(failedAccessToken: requestToken) {
            return try await call(
                kind: kind, path: path, args: args, authenticated: true,
                retried: true, accessTokenOverride: refreshed
            )
        }
        throw ConvexException(code: Self.extractCode(errorMessage), message: Self.humanize(errorMessage))
    }

    private func tryRefresh(failedAccessToken: String?) async -> String? {
        guard !isRefreshing else { return nil }
        isRefreshing = true
        defer { isRefreshing = false }
        guard let expected = refreshCredentialsProvider(),
              let failedAccessToken, !failedAccessToken.isEmpty,
              expected.accessToken == failedAccessToken else { return nil }
        do {
            guard let url = URL(string: "\(baseURL)/api/action") else { return nil }
            var request = URLRequest(url: url)
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONSerialization.data(withJSONObject: [
                "path": "auth:signIn",
                "args": ["refreshToken": expected.refreshToken],
                "format": "json",
            ])
            let (data, _) = try await session.data(for: request)
            let json = try parseJSONObject(data)
            guard (json["status"] as? String) == "success",
                  let value = json["value"] as? [String: Any],
                  let tokens = value["tokens"] as? [String: Any],
                  let access = tokens["token"] as? String,
                  let refresh = tokens["refreshToken"] as? String else { return nil }
            return onTokensRefreshed(expected, access, refresh) ? access : nil
        } catch {
            return nil
        }
    }

    private func unwrapValue(_ value: Any?) -> [String: Any] {
        switch value {
        case nil, is NSNull: return [:]
        case let object as [String: Any]: return object
        case let array as [Any]: return ["items": array]
        case let bool as Bool: return ["ok": bool]
        case let number as NSNumber: return ["value": number]
        case let string as String: return ["value": string]
        default: return ["value": "\(value!)"]
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
            "INVALID_CREDENTIALS", "InvalidAccountId", "InvalidSecret", "Invalid credentials", "USER_NOT_ACTIVE",
            "ACCOUNT_LOCKED", "PASSWORD_TOO_SHORT", "PASSWORD_CHANGE_FAILED", "PASSWORD_CHANGED_SYNC_PENDING",
            "PASSWORD_CHANGE_REQUIRED", "PASSWORD_RESET_FAILED", "PASSWORD_RESET_EMAIL_FAILED",
            "MAIL_NOT_CONFIGURED", "MAIL_AUTH_FAILED", "PUBLIC_SIGNUP_DISABLED", "INVALID_EMAIL",
            "INVALID_AUTH_FLOW", "FORBIDDEN", "UNAUTHENTICATED", "CANNOT_REVOKE_CURRENT_SESSION",
            "SESSION_NOT_FOUND",
        ]
        return known.first { message.localizedCaseInsensitiveContains($0) } ?? message
    }

    static func humanize(_ message: String) -> String {
        let code = extractCode(message)
        switch true {
        case code.localizedCaseInsensitiveContains("Invalid"), code.localizedCaseInsensitiveContains("credentials"):
            return "Email hoặc mật khẩu không đúng."
        case code == "ACCOUNT_LOCKED":
            return "Tài khoản đã bị khóa do đăng nhập sai quá số lần. Liên hệ quản trị viên để mở khóa."
        case code == "USER_NOT_ACTIVE": return "Tài khoản chưa được kích hoạt hoặc đã bị khóa."
        case code == "PASSWORD_TOO_SHORT": return "Mật khẩu phải có ít nhất 8 ký tự."
        case code == "PASSWORD_CHANGE_FAILED": return "Không đổi được mật khẩu. Thử lại sau."
        case code == "PASSWORD_CHANGED_SYNC_PENDING": return "Mật khẩu đã đổi nhưng hồ sơ chưa đồng bộ. Đăng nhập lại."
        case code == "PASSWORD_CHANGE_REQUIRED": return "Bạn cần đổi mật khẩu trước khi tiếp tục."
        case code == "PASSWORD_RESET_FAILED": return "Không thể đặt lại mật khẩu. Thử lại sau."
        case code == "PASSWORD_RESET_EMAIL_FAILED":
            return "Đã tạo mật khẩu tạm nhưng chưa gửi được email. Liên hệ quản trị viên."
        case code == "MAIL_NOT_CONFIGURED", code == "MAIL_AUTH_FAILED":
            return "Hệ thống chưa gửi được email. Liên hệ quản trị viên."
        case code == "INVALID_EMAIL": return "Email không hợp lệ."
        case code == "ASSIGNMENT_CREATE_FORBIDDEN":
            return "Bạn không có quyền tạo công tác hoặc công việc."
        case code == "INVALID_WORK_TITLE": return "Vui lòng nhập tên công việc (tối đa 200 ký tự)."
        case code == "INVALID_WORK_CONTENT": return "Nội dung công việc bắt buộc và tối đa 2.000 ký tự."
        case code == "INVALID_WORK_DEADLINE": return "Hạn chót công việc không hợp lệ."
        case code == "INVALID_WORK_ASSIGNEE":
            return "Người thực hiện phải cùng phòng ban và có cấp sao thấp hơn bạn."
        case code == "INVALID_WORK_FILE": return "Tệp công văn không đúng định dạng được hỗ trợ."
        case code == "WORK_ASSIGNMENTS_REQUIRED": return "Vui lòng thêm ít nhất một phân công."
        case code == "WORK_DEPARTMENT_FORBIDDEN":
            return "Tổ trưởng/tổ phó chỉ được giao công việc cho cấp dưới, không chọn cả phòng ban."
        case code == "WORK_DEPARTMENT_DUPLICATE":
            return "Mỗi phòng ban chỉ được nhận một đầu việc trong cùng công văn."
        case code == "NOT_A_SUBORDINATE":
            return "Chỉ được giao hoặc cập nhật cấp dưới trong cùng phòng ban."
        case code.localizedCaseInsensitiveContains("FORBIDDEN"):
            return "Bạn không có quyền thực hiện thao tác này."
        default: return String(code.prefix(180))
        }
    }
}

private extension String {
    var nilIfBlank: String? {
        let trimmed = trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }
}
