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
        let path: String
        let idName: String
        switch target.kind {
        case .duty:
            path = "dutyMessages:create"
            idName = "dutyId"
        case .work:
            path = "workMessages:create"
            idName = "documentId"
        case .group:
            path = "groupMessages:create"
            idName = "groupId"
        }
        _ = try await convex.mutation(path, args: [idName: target.entityId, "bodyHtml": bodyHtml])
    }

    func recall(_ target: ChatTarget, messageId: String) async throws {
        let path: String
        switch target.kind {
        case .duty: path = "dutyMessages:recall"
        case .work: path = "workMessages:recall"
        case .group: path = "groupMessages:recall"
        }
        _ = try await convex.mutation(path, args: ["messageId": messageId])
    }

    func inbox() async throws -> ChatInboxSnapshot {
        let json = try await convex.query("chatHub:list")
        let rows = json["conversations"] as? [[String: Any]] ?? []
        let conversations: [ChatConversation] = rows.compactMap { item in
            guard let kind = chatKindFromWire((item["kind"] as? String) ?? "") else { return nil }
            let entityId = (item["entityId"] as? String) ?? ""
            guard !entityId.isEmpty else { return nil }
            let threadKey = ((item["threadKey"] as? String).flatMap { $0.isEmpty ? nil : $0 }) ?? chatThreadKey(kind, entityId)
            return ChatConversation(
                threadKey: threadKey,
                kind: kind,
                entityId: entityId,
                title: (item["title"] as? String) ?? "",
                lastBodyText: (item["lastBodyText"] as? String) ?? "",
                lastMessageAt: chatInt64(item["lastMessageAt"]),
                lastAuthorUserId: (item["lastAuthorUserId"] as? String) ?? "",
                unreadCount: chatInt(item["unreadCount"]),
                memberCount: chatInt(item["memberCount"]),
                viewerIsMember: item["viewerIsMember"] as? Bool ?? true
            )
        }
        return ChatInboxSnapshot(
            currentUserId: (json["currentUserId"] as? String) ?? "",
            isAdmin: json["isAdmin"] as? Bool ?? false,
            backfillPending: json["backfillPending"] as? Bool ?? false,
            conversations: conversations
        )
    }

    func unreadTotal() async throws -> Int {
        let json = try await convex.query("chatHub:unreadTotal")
        return chatInt(json["count"])
    }

    func markRead(threadKey: String) async throws {
        _ = try await convex.mutation("chatHub:markRead", args: ["threadKey": threadKey])
    }

    func archiveMine(threadKey: String) async throws {
        _ = try await convex.mutation("chatHub:archiveMine", args: ["threadKey": threadKey])
    }

    func continueBackfill() async throws -> Bool {
        let json = try await convex.mutation("chatHub:continueBackfill")
        return json["done"] as? Bool ?? false
    }

    func directory() async throws -> [ChatPerson] {
        let json = try await convex.query("chatHub:directory")
        let rows = json["people"] as? [[String: Any]] ?? []
        return rows.compactMap { item in
            let userId = (item["userId"] as? String) ?? ""
            guard !userId.isEmpty else { return nil }
            let name = (item["name"] as? String).flatMap { $0.isEmpty ? nil : $0 } ?? "Người dùng"
            return ChatPerson(
                userId: userId,
                name: name,
                email: (item["email"] as? String) ?? "",
                departmentName: (item["departmentName"] as? String) ?? ""
            )
        }
    }

    func groupState(groupId: String) async throws -> ChatGroupState? {
        let json = try await convex.query("chatHub:groupState", args: ["groupId": groupId])
        let id = (json["groupId"] as? String) ?? ""
        guard !id.isEmpty else { return nil }
        let rows = json["members"] as? [[String: Any]] ?? []
        let members: [ChatGroupMember] = rows.compactMap { item in
            let userId = (item["userId"] as? String) ?? ""
            guard !userId.isEmpty else { return nil }
            return ChatGroupMember(
                userId: userId,
                name: (item["name"] as? String).flatMap { $0.isEmpty ? nil : $0 } ?? "Người dùng",
                role: (item["role"] as? String).flatMap { $0.isEmpty ? nil : $0 } ?? "member",
                isSelf: item["isSelf"] as? Bool ?? false
            )
        }
        return ChatGroupState(
            groupId: id,
            name: (json["name"] as? String) ?? "",
            memberCount: chatInt(json["memberCount"]),
            canManage: json["canManage"] as? Bool ?? false,
            canDissolve: json["canDissolve"] as? Bool ?? false,
            canLeave: json["canLeave"] as? Bool ?? false,
            canSend: json["canSend"] as? Bool ?? false,
            members: members
        )
    }

    func createGroup(name: String, memberIds: [String]) async throws -> String {
        let json = try await convex.mutation("chatHub:createGroup", args: ["name": name, "memberIds": memberIds])
        return (json["groupId"] as? String) ?? ""
    }

    func renameGroup(groupId: String, name: String) async throws {
        _ = try await convex.mutation("chatHub:renameGroup", args: ["groupId": groupId, "name": name])
    }

    func addMembers(groupId: String, memberIds: [String]) async throws {
        _ = try await convex.mutation("chatHub:addMembers", args: ["groupId": groupId, "memberIds": memberIds])
    }

    func removeMember(groupId: String, userId: String) async throws {
        _ = try await convex.mutation("chatHub:removeMember", args: ["groupId": groupId, "userId": userId])
    }

    func leaveGroup(groupId: String) async throws {
        _ = try await convex.mutation("chatHub:leaveGroup", args: ["groupId": groupId])
    }

    func dissolveGroup(groupId: String) async throws {
        _ = try await convex.mutation("chatHub:dissolveGroup", args: ["groupId": groupId])
    }

    private func threadRequest(_ target: ChatTarget) -> (path: String, args: [String: Any], titleKey: String, fallback: String) {
        switch target.kind {
        case .duty:
            return ("dutyMessages:list", ["dutyId": target.entityId], "dutyTitle", "Công tác")
        case .work:
            return ("workMessages:list", ["documentId": target.entityId], "documentTitle", "Công việc")
        case .group:
            return ("groupMessages:list", ["groupId": target.entityId], "groupTitle", "Nhóm")
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

private func chatInt(_ value: Any?) -> Int {
    switch value {
    case let number as NSNumber: return number.intValue
    case let text as String: return Int(text) ?? 0
    default: return 0
    }
}

private func chatInt64(_ value: Any?) -> Int64 {
    switch value {
    case let number as NSNumber: return number.int64Value
    case let text as String: return Int64(text) ?? 0
    default: return 0
    }
}
