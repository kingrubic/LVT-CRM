import Foundation

final class ChatRepository: Sendable {
    private let convex: ConvexHttpClient

    init(convex: ConvexHttpClient) {
        self.convex = convex
    }

    func list(_ target: ChatTarget) async throws -> ChatThread {
        let request = threadRequest(target)
        let result = try await convex.query(request.path, args: request.args)
        return parseThread(result, titleKey: request.titleKey, fallback: target.title.isEmpty ? request.fallback : target.title)
    }

    func send(_ target: ChatTarget, bodyHtml: String) async throws {
        switch target.kind {
        case .duty:
            _ = try await convex.mutation(
                "dutyMessages:create",
                args: ["dutyId": target.entityId, "bodyHtml": bodyHtml]
            )
        case .work:
            _ = try await convex.mutation(
                "workMessages:create",
                args: ["documentId": target.entityId, "bodyHtml": bodyHtml]
            )
        }
    }

    func recall(_ target: ChatTarget, messageId: String) async throws {
        let path = target.kind == .duty ? "dutyMessages:recall" : "workMessages:recall"
        _ = try await convex.mutation(path, args: ["messageId": messageId])
    }

    private func threadRequest(_ target: ChatTarget) -> (path: String, args: [String: Any], titleKey: String, fallback: String) {
        switch target.kind {
        case .duty:
            return ("dutyMessages:list", ["dutyId": target.entityId], "dutyTitle", "Công tác")
        case .work:
            return ("workMessages:list", ["documentId": target.entityId], "documentTitle", "Công việc")
        }
    }

    private func parseThread(_ json: [String: Any], titleKey: String, fallback: String) -> ChatThread {
        let rows = json["messages"] as? [[String: Any]] ?? []
        let messages: [ChatMessage] = rows.compactMap { item in
            let id = (item["_id"] as? String) ?? ""
            guard !id.isEmpty else { return nil }
            let name = ((item["authorName"] as? String) ?? "").isEmpty ? "Người dùng" : (item["authorName"] as? String ?? "Người dùng")
            let initials = (item["authorInitials"] as? String).flatMap { $0.isEmpty ? nil : $0 } ?? chatAuthorInitials(name)
            return ChatMessage(
                id: id,
                authorName: name,
                authorInitials: initials,
                bodyHtml: (item["bodyHtml"] as? String) ?? "",
                createdAt: chatInt64(item["createdAt"]),
                recalled: item["recalled"] as? Bool ?? false,
                canRecall: item["canRecall"] as? Bool ?? false,
                isSelf: item["isSelf"] as? Bool ?? false
            )
        }
        let title = (json[titleKey] as? String).flatMap { $0.isEmpty ? nil : $0 } ?? fallback
        return ChatThread(title: title, messages: messages)
    }
}

private func chatInt64(_ value: Any?) -> Int64 {
    switch value {
    case let number as NSNumber: return number.int64Value
    case let text as String: return Int64(text) ?? 0
    default: return 0
    }
}
