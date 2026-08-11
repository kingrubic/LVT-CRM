import Foundation

struct WorkTaskItem: Identifiable, Equatable, Sendable {
    enum Kind: String, Sendable { case workItem, personalTask }
    let id: String
    let kind: Kind
    let title: String
    let deadline: String
    var status: String
    let documentContent: String
    let departmentName: String
    let qualityPercent: Int?
    let rejectionReason: String
    let isAdmin: Bool
}

struct WorkMemberItem: Identifiable, Equatable, Sendable {
    let id: String
    let name: String
    let status: String
}

struct WorkDocumentAssignment: Identifiable, Equatable, Sendable {
    let id: String
    let departmentName: String
    let content: String
    let deadline: String
    let status: String
    let members: [WorkMemberItem]
}

struct WorkCompletionReviewItem: Identifiable, Equatable, Sendable {
    var id: String { workItemId + userId }
    let workItemId: String
    let userId: String
    let userName: String
    let content: String
    let deadline: String
    let departmentName: String
}

struct WorkApprovalItem: Identifiable, Equatable, Sendable {
    let id: String
    let fileName: String
    let fileURL: String
    let privateFile: Bool
    let content: String
    let deadline: String
    let status: String
    let approvalCount: Int
    let approvalTotal: Int
    var myDecision: String
    let assignments: [WorkDocumentAssignment]
}

struct WorkSnapshot: Equatable, Sendable {
    let assignerMode: String
    let isAdmin: Bool
    let accessLevel: Int
    let tasks: [WorkTaskItem]
    let approvals: [WorkApprovalItem]
    let completionReviews: [WorkCompletionReviewItem]
}

enum WorkHelpers {
    static func needsCompletion(_ status: String) -> Bool {
        ["pending_task", "pending", "overdue", "rejected", "rejected_completion"].contains(status)
    }

    static func orderedTasks(_ tasks: [WorkTaskItem]) -> [WorkTaskItem] {
        tasks.sorted {
            let lhsNeeds = needsCompletion($0.status)
            let rhsNeeds = needsCompletion($1.status)
            if lhsNeeds != rhsNeeds { return lhsNeeds && !rhsNeeds }
            if $0.deadline != $1.deadline { return $0.deadline < $1.deadline }
            return $0.title < $1.title
        }
    }

    static func decisionForUser(currentUserId: String, approvers: [[String: Any]]) -> String {
        guard let approver = approvers.first(where: { ($0["_id"] as? String) == currentUserId }) else {
            return ""
        }
        if (approver["approved"] as? Bool) == true { return "approved" }
        if (approver["rejected"] as? Bool) == true { return "rejected" }
        return ""
    }
}

final class WorkRepository: Sendable {
    private let convex: ConvexHttpClient
    private let tokenProvider: @Sendable () -> String?

    init(convex: ConvexHttpClient, tokenProvider: @escaping @Sendable () -> String?) {
        self.convex = convex
        self.tokenProvider = tokenProvider
    }

    func listMine() async throws -> WorkSnapshot {
        let result = try await convex.query("work:listMine")
        let isAdmin = (result["isAdmin"] as? Bool) ?? false
        let accessLevel = (result["level"] as? Int) ?? 0
        let assignerMode = (result["assignerMode"] as? String) ?? ""
        let currentUserId = (result["userId"] as? String) ?? ""

        var approvals: [WorkApprovalItem] = []
        var completionReviews: [WorkCompletionReviewItem] = []
        if isAdmin {
            let adminResult = try await convex.query("work:listAdmin")
            approvals = (adminResult["documents"] as? [[String: Any]] ?? []).map { document in
                WorkApprovalItem(
                    id: (document["_id"] as? String) ?? "",
                    fileName: (document["fileName"] as? String) ?? "",
                    fileURL: (document["fileUrl"] as? String) ?? "",
                    privateFile: (document["privateFile"] as? Bool) ?? false,
                    content: (document["content"] as? String) ?? "",
                    deadline: (document["deadline"] as? String) ?? "",
                    status: (document["status"] as? String) ?? "",
                    approvalCount: (document["approvalCount"] as? Int) ?? 0,
                    approvalTotal: (document["approvalTotal"] as? Int) ?? 0,
                    myDecision: "",
                    assignments: parseAssignments(document["assignments"] as? [[String: Any]])
                )
            }
            completionReviews = parseCompletionReviews(
                adminResult["pendingCompletionReviews"] as? [[String: Any]]
            )
        } else {
            approvals = (result["approvals"] as? [[String: Any]] ?? []).map { document in
                WorkApprovalItem(
                    id: (document["_id"] as? String) ?? "",
                    fileName: (document["fileName"] as? String) ?? "",
                    fileURL: (document["fileUrl"] as? String) ?? "",
                    privateFile: (document["privateFile"] as? Bool) ?? false,
                    content: (document["content"] as? String) ?? "",
                    deadline: (document["deadline"] as? String) ?? "",
                    status: (document["status"] as? String) ?? "",
                    approvalCount: (document["approvalCount"] as? Int) ?? 0,
                    approvalTotal: (document["approvalTotal"] as? Int) ?? 0,
                    myDecision: WorkHelpers.decisionForUser(
                        currentUserId: currentUserId,
                        approvers: document["approvers"] as? [[String: Any]] ?? []
                    ),
                    assignments: parseAssignments(document["assignments"] as? [[String: Any]])
                )
            }
        }

        var tasks: [WorkTaskItem] = []
        for task in result["myTasks"] as? [[String: Any]] ?? [] {
            tasks.append(WorkTaskItem(
                id: (task["_id"] as? String) ?? "",
                kind: .workItem,
                title: (task["content"] as? String) ?? "",
                deadline: (task["deadline"] as? String) ?? "",
                status: (task["status"] as? String) ?? "",
                documentContent: (task["documentContent"] as? String) ?? "",
                departmentName: (task["departmentName"] as? String) ?? "",
                qualityPercent: task["qualityPercent"] as? Int,
                rejectionReason: (task["rejectionReason"] as? String) ?? "",
                isAdmin: isAdmin
            ))
        }
        for task in result["personalTasks"] as? [[String: Any]] ?? [] {
            let title = ((task["title"] as? String)?.nilIfBlank)
                ?? (task["documentContent"] as? String)
                ?? ""
            tasks.append(WorkTaskItem(
                id: (task["_id"] as? String) ?? "",
                kind: .personalTask,
                title: title,
                deadline: (task["deadline"] as? String) ?? "",
                status: (task["status"] as? String) ?? "",
                documentContent: (task["documentContent"] as? String) ?? "",
                departmentName: (task["departmentName"] as? String) ?? "",
                qualityPercent: task["qualityPercent"] as? Int,
                rejectionReason: (task["rejectionReason"] as? String) ?? "",
                isAdmin: isAdmin
            ))
        }

        let sortedApprovals = approvals.sorted {
            let lhsPending = $0.status == "pending"
            let rhsPending = $1.status == "pending"
            if lhsPending != rhsPending { return lhsPending && !rhsPending }
            return $0.deadline < $1.deadline
        }
        return WorkSnapshot(
            assignerMode: assignerMode,
            isAdmin: isAdmin,
            accessLevel: accessLevel,
            tasks: WorkHelpers.orderedTasks(tasks),
            approvals: sortedApprovals,
            completionReviews: completionReviews
        )
    }

    func complete(item: WorkTaskItem, qualityPercent: Int? = nil) async throws {
        var args: [String: Any] = [:]
        if let qualityPercent { args["qualityPercent"] = qualityPercent }
        switch item.kind {
        case .workItem:
            args["workItemId"] = item.id
            _ = try await convex.mutation("work:completeWorkItem", args: args)
        case .personalTask:
            args["taskId"] = item.id
            _ = try await convex.mutation("work:completePersonalTask", args: args)
        }
    }

    func decideApproval(documentId: String, approve: Bool) async throws {
        _ = try await convex.mutation(
            approve ? "work:approveDocument" : "work:rejectDocument",
            args: ["documentId": documentId]
        )
    }

    func reviewCompletion(
        review: WorkCompletionReviewItem,
        approve: Bool,
        qualityPercent: Int? = nil,
        rejectionReason: String? = nil
    ) async throws {
        var args: [String: Any] = [
            "workItemId": review.workItemId,
            "userId": review.userId,
            "decision": approve ? "approve" : "reject",
        ]
        if let qualityPercent { args["qualityPercent"] = qualityPercent }
        if let rejectionReason, !rejectionReason.isEmpty { args["rejectionReason"] = rejectionReason }
        _ = try await convex.mutation("work:reviewWorkCompletion", args: args)
    }

    func downloadDocument(_ document: WorkApprovalItem) async throws -> URL {
        let sourceURL: URL
        var request: URLRequest
        if !document.fileURL.isEmpty, let url = URL(string: document.fileURL) {
            sourceURL = url
            request = URLRequest(url: url)
        } else if document.privateFile,
                  let encodedId = document.id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed),
                  let url = URL(string: "\(ConvexConfig.webURL)/api/files/\(encodedId)"),
                  let token = tokenProvider(), !token.isEmpty {
            sourceURL = url
            request = URLRequest(url: url)
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        } else {
            throw ConvexException(code: "WORK_FILE_UNAVAILABLE", message: "Tệp công văn chưa sẵn sàng để mở.")
        }
        request.timeoutInterval = 180
        let configuration = URLSessionConfiguration.ephemeral
        configuration.timeoutIntervalForRequest = 180
        configuration.timeoutIntervalForResource = 240
        let (temporaryURL, response) = try await URLSession(configuration: configuration).download(for: request)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            throw ConvexException(code: "WORK_FILE_DOWNLOAD_FAILED", message: "Không thể tải tệp công văn. Hãy thử lại.")
        }
        let safeName = document.fileName
            .replacingOccurrences(of: "/", with: "-")
            .replacingOccurrences(of: ":", with: "-")
        let fallbackName = sourceURL.lastPathComponent.isEmpty ? "cong-van" : sourceURL.lastPathComponent
        let destination = FileManager.default.temporaryDirectory
            .appendingPathComponent("lvt-work-\(document.id)-\(safeName.isEmpty ? fallbackName : safeName)")
        try? FileManager.default.removeItem(at: destination)
        try FileManager.default.moveItem(at: temporaryURL, to: destination)
        return destination
    }

    private func parseAssignments(_ items: [[String: Any]]?) -> [WorkDocumentAssignment] {
        (items ?? []).map { item in
            let members = (item["members"] as? [[String: Any]] ?? []).map { member in
                WorkMemberItem(
                    id: (member["_id"] as? String) ?? "",
                    name: ((member["name"] as? String)?.nilIfBlank)
                        ?? (member["email"] as? String)
                        ?? "",
                    status: (member["status"] as? String) ?? ""
                )
            }
            return WorkDocumentAssignment(
                id: (item["_id"] as? String) ?? "",
                departmentName: (item["departmentName"] as? String) ?? "",
                content: (item["content"] as? String) ?? "",
                deadline: (item["deadline"] as? String) ?? "",
                status: (item["status"] as? String) ?? "",
                members: members
            )
        }
    }

    private func parseCompletionReviews(_ items: [[String: Any]]?) -> [WorkCompletionReviewItem] {
        (items ?? []).map { item in
            WorkCompletionReviewItem(
                workItemId: (item["workItemId"] as? String) ?? "",
                userId: (item["userId"] as? String) ?? "",
                userName: (item["userName"] as? String) ?? "",
                content: (item["content"] as? String) ?? "",
                deadline: (item["deadline"] as? String) ?? "",
                departmentName: (item["departmentName"] as? String) ?? ""
            )
        }
    }
}

private extension String {
    var nilIfBlank: String? {
        let trimmed = trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }
}
