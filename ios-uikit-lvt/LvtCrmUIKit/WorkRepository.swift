import Foundation
import CryptoKit

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
    let documentTitle: String
    let fileName: String
    let memberNames: [String]
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
    private let documentCache = WorkDocumentCache()

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
                isAdmin: isAdmin,
                documentTitle: (task["documentTitle"] as? String) ?? "",
                fileName: (task["fileName"] as? String) ?? "",
                memberNames: Self.memberNames(from: task)
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
                isAdmin: isAdmin,
                documentTitle: (task["documentTitle"] as? String) ?? "",
                fileName: (task["fileName"] as? String) ?? "",
                memberNames: Self.memberNames(from: task, key: "assignees")
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
        let sourceIdentity: String
        if !document.fileURL.isEmpty, let url = URL(string: document.fileURL) {
            sourceURL = url
            request = URLRequest(url: url)
            sourceIdentity = "public:\(document.id):\(document.fileURL)"
        } else if document.privateFile,
                  let encodedId = document.id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed),
                  let url = URL(string: "\(ConvexConfig.webURL)/api/files/\(encodedId)"),
                  let metadataURL = URL(string: "\(ConvexConfig.webURL)/api/files/\(encodedId)/metadata"),
                  let token = tokenProvider(), !token.isEmpty {
            var metadataRequest = URLRequest(url: metadataURL)
            metadataRequest.cachePolicy = .reloadIgnoringLocalCacheData
            metadataRequest.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            let (metadataData, metadataResponse) = try await URLSession.shared.data(for: metadataRequest)
            guard let metadataHTTP = metadataResponse as? HTTPURLResponse,
                  (200..<300).contains(metadataHTTP.statusCode),
                  let metadata = try JSONSerialization.jsonObject(with: metadataData) as? [String: Any],
                  let fileVersion = metadata["fileVersion"] as? String,
                  !fileVersion.isEmpty else {
                throw ConvexException(code: "WORK_FILE_FORBIDDEN", message: "Bạn không còn quyền mở tệp công văn này.")
            }
            sourceURL = url
            request = URLRequest(url: url)
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            sourceIdentity = "private:\(document.id):\(fileVersion)"
        } else {
            throw ConvexException(code: "WORK_FILE_UNAVAILABLE", message: "Tệp công văn chưa sẵn sàng để mở.")
        }
        if let cached = await documentCache.cachedURL(sourceIdentity: sourceIdentity) {
            return cached
        }
        request.timeoutInterval = 180
        let configuration = URLSessionConfiguration.ephemeral
        configuration.timeoutIntervalForRequest = 180
        configuration.timeoutIntervalForResource = 240
        let (temporaryURL, response) = try await URLSession(configuration: configuration).download(for: request)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            throw ConvexException(code: "WORK_FILE_DOWNLOAD_FAILED", message: "Không thể tải tệp công văn. Hãy thử lại.")
        }
        let fallbackName = sourceURL.lastPathComponent.isEmpty ? "cong-van" : sourceURL.lastPathComponent
        return try await documentCache.store(
            downloadedURL: temporaryURL,
            sourceIdentity: sourceIdentity,
            fileName: document.fileName.isEmpty ? fallbackName : document.fileName
        )
    }

    private static func memberNames(from value: [String: Any], key: String = "members") -> [String] {
        ((value[key] as? [[String: Any]]) ?? []).compactMap { member in
            let name = ((member["name"] as? String) ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            if !name.isEmpty { return name }
            let email = ((member["email"] as? String) ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            return email.isEmpty ? nil : email
        }
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

private actor WorkDocumentCache {
    private let ttl: TimeInterval = 24 * 60 * 60
    private let maxBytes: Int64 = 1024 * 1024 * 1024
    private let fileManager = FileManager.default

    private var directory: URL {
        let base = fileManager.urls(for: .cachesDirectory, in: .userDomainMask).first
            ?? fileManager.temporaryDirectory
        return base.appendingPathComponent("LvtCrmUIKit/work-documents", isDirectory: true)
    }

    func cachedURL(sourceIdentity: String) -> URL? {
        let key = cacheKey(sourceIdentity)
        guard let candidate = existingFile(for: key), isValid(candidate) else {
            removeFiles(withKey: key)
            return nil
        }
        try? fileManager.setAttributes([.modificationDate: Date()], ofItemAtPath: candidate.path)
        return candidate
    }

    func store(downloadedURL: URL, sourceIdentity: String, fileName: String) throws -> URL {
        try fileManager.createDirectory(at: directory, withIntermediateDirectories: true)
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        var cacheDirectory = directory
        try? cacheDirectory.setResourceValues(values)

        let attributes = try fileManager.attributesOfItem(atPath: downloadedURL.path)
        guard (attributes[.size] as? NSNumber)?.int64Value ?? 0 > 0 else {
            throw ConvexException(code: "WORK_FILE_DOWNLOAD_FAILED", message: "Tệp công văn tải về không hợp lệ.")
        }
        let key = cacheKey(sourceIdentity)
        removeFiles(withKey: key)
        let destination = directory.appendingPathComponent("\(key)--\(sanitized(fileName))")
        let staging = directory.appendingPathComponent(".\(key)-\(UUID().uuidString).tmp")
        try fileManager.moveItem(at: downloadedURL, to: staging)
        do {
            try fileManager.moveItem(at: staging, to: destination)
            try fileManager.setAttributes(
                [.creationDate: Date(), .modificationDate: Date()],
                ofItemAtPath: destination.path
            )
            try prune()
            return destination
        } catch {
            try? fileManager.removeItem(at: staging)
            throw error
        }
    }

    private func existingFile(for key: String) -> URL? {
        guard let files = try? fileManager.contentsOfDirectory(
            at: directory,
            includingPropertiesForKeys: [.isRegularFileKey],
            options: [.skipsHiddenFiles]
        ) else { return nil }
        return files.first { $0.lastPathComponent.hasPrefix("\(key)--") }
    }

    private func isValid(_ url: URL) -> Bool {
        guard let attributes = try? fileManager.attributesOfItem(atPath: url.path),
              (attributes[.type] as? FileAttributeType) == .typeRegular,
              (attributes[.size] as? NSNumber)?.int64Value ?? 0 > 0,
              let created = attributes[.creationDate] as? Date else { return false }
        return Date().timeIntervalSince(created) < ttl
    }

    private func prune() throws {
        let files = try fileManager.contentsOfDirectory(
            at: directory,
            includingPropertiesForKeys: nil,
            options: [.skipsHiddenFiles]
        )
        var entries: [(URL, Int64, Date)] = []
        for file in files {
            guard let attributes = try? fileManager.attributesOfItem(atPath: file.path),
                  (attributes[.type] as? FileAttributeType) == .typeRegular else { continue }
            let size = (attributes[.size] as? NSNumber)?.int64Value ?? 0
            let created = attributes[.creationDate] as? Date ?? .distantPast
            if size <= 0 || Date().timeIntervalSince(created) >= ttl {
                try? fileManager.removeItem(at: file)
                continue
            }
            entries.append((file, size, attributes[.modificationDate] as? Date ?? created))
        }
        var total = entries.reduce(Int64(0)) { $0 + $1.1 }
        for entry in entries.sorted(by: { $0.2 < $1.2 }) where total > maxBytes {
            try? fileManager.removeItem(at: entry.0)
            total -= entry.1
        }
    }

    private func removeFiles(withKey key: String) {
        guard let files = try? fileManager.contentsOfDirectory(
            at: directory,
            includingPropertiesForKeys: nil,
            options: []
        ) else { return }
        for file in files where file.lastPathComponent.hasPrefix("\(key)--") {
            try? fileManager.removeItem(at: file)
        }
    }

    private func cacheKey(_ sourceIdentity: String) -> String {
        SHA256.hash(data: Data(sourceIdentity.utf8)).map { String(format: "%02x", $0) }.joined()
    }

    private func sanitized(_ fileName: String) -> String {
        let value = fileName
            .replacingOccurrences(of: "/", with: "-")
            .replacingOccurrences(of: ":", with: "-")
        return value.isEmpty ? "cong-van" : String(value.suffix(180))
    }
}

private extension String {
    var nilIfBlank: String? {
        let trimmed = trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }
}
