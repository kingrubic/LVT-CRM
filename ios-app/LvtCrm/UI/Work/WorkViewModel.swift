import Foundation

@MainActor
final class WorkViewModel: ObservableObject {
    @Published private(set) var loading = true
    @Published private(set) var refreshing = false
    @Published private(set) var error: String?
    @Published private(set) var actionError: String?
    @Published private(set) var isAdmin = false
    @Published private(set) var accessLevel = 0
    @Published private(set) var tasks: [WorkTaskItem] = []
    @Published private(set) var approvals: [WorkApprovalItem] = []
    @Published private(set) var completionReviews: [WorkCompletionReviewItem] = []
    @Published private(set) var busyTaskId: String?
    @Published private(set) var busyApprovalId: String?
    @Published private(set) var busyReviewId: String?
    @Published var qualityPromptTask: WorkTaskItem?
    @Published var qualityInput = "100"
    @Published var pendingOnly = false
    @Published var adminFilter: AdminFilter = .all

    enum AdminFilter: String, CaseIterable, Identifiable {
        case all, pending, approved, pendingCompletion
        var id: String { rawValue }
        var title: String {
            switch self {
            case .all: return "Tất cả"
            case .pending: return "Chờ duyệt"
            case .approved: return "Đã duyệt"
            case .pendingCompletion: return "Chờ xác nhận"
            }
        }
    }

    private let repository: WorkRepository
    private var operationBusy = false
    private var refreshPending = false

    init(repository: WorkRepository) {
        self.repository = repository
        refresh(initial: true)
    }

    var canApprove: Bool { accessLevel >= 4 || isAdmin }

    var visibleApprovals: [WorkApprovalItem] {
        if isAdmin {
            switch adminFilter {
            case .all: return approvals
            case .pending: return approvals.filter { $0.status == "pending" }
            case .approved: return approvals.filter { $0.status == "approved" }
            case .pendingCompletion: return approvals
            }
        }
        let undecidedFirst = approvals.sorted {
            let lhsOpen = $0.myDecision.isEmpty
            let rhsOpen = $1.myDecision.isEmpty
            if lhsOpen != rhsOpen { return lhsOpen && !rhsOpen }
            return $0.deadline < $1.deadline
        }
        return pendingOnly ? undecidedFirst.filter { $0.myDecision.isEmpty } : undecidedFirst
    }

    var visibleTasks: [WorkTaskItem] {
        pendingOnly ? tasks.filter { WorkHelpers.needsCompletion($0.status) } : tasks
    }

    func refresh(initial: Bool = false) {
        if operationBusy {
            refreshPending = true
            return
        }
        operationBusy = true
        loading = initial
        refreshing = !initial
        error = nil
        actionError = nil
        Task {
            defer { releaseOperation() }
            do {
                let snap = try await repository.listMine()
                isAdmin = snap.isAdmin
                accessLevel = snap.accessLevel
                tasks = snap.tasks
                approvals = snap.approvals
                completionReviews = snap.completionReviews
                loading = false
                refreshing = false
            } catch {
                loading = false
                refreshing = false
                self.error = (error as? ConvexException)?.message
                    ?? ConvexHttpClient.humanize(error.localizedDescription)
            }
        }
    }

    func requestComplete(_ task: WorkTaskItem) {
        if task.isAdmin {
            qualityPromptTask = task
            qualityInput = "100"
            actionError = nil
        } else {
            complete(task, qualityPercent: nil)
        }
    }

    func confirmQuality() {
        guard let task = qualityPromptTask else { return }
        let value = Int(qualityInput) ?? -1
        guard (0...100).contains(value) else {
            actionError = "Phần trăm chất lượng phải từ 0 đến 100."
            return
        }
        qualityPromptTask = nil
        complete(task, qualityPercent: value)
    }

    func setActionError(_ message: String?) {
        actionError = message
    }

    func decideApproval(_ approval: WorkApprovalItem, approve: Bool) {
        busyApprovalId = approval.id
        actionError = nil
        Task {
            while operationBusy { try? await Task.sleep(nanoseconds: 50_000_000) }
            operationBusy = true
            defer {
                if busyApprovalId == approval.id { busyApprovalId = nil }
                releaseOperation()
            }
            do {
                try await repository.decideApproval(documentId: approval.id, approve: approve)
                approvals = approvals.map {
                    $0.id == approval.id
                        ? WorkApprovalItem(
                            id: $0.id,
                            fileName: $0.fileName,
                            content: $0.content,
                            deadline: $0.deadline,
                            status: $0.status,
                            approvalCount: $0.approvalCount,
                            approvalTotal: $0.approvalTotal,
                            myDecision: approve ? "approved" : "rejected",
                            assignments: $0.assignments
                        )
                        : $0
                }
                try await reloadAfterMutation()
            } catch {
                actionError = (error as? ConvexException)?.message
                    ?? ConvexHttpClient.humanize(error.localizedDescription)
            }
        }
    }

    func reviewCompletion(
        _ review: WorkCompletionReviewItem,
        approve: Bool,
        qualityPercent: Int? = nil,
        rejectionReason: String? = nil
    ) {
        let operationId = review.id
        busyReviewId = operationId
        actionError = nil
        Task {
            while operationBusy { try? await Task.sleep(nanoseconds: 50_000_000) }
            operationBusy = true
            defer {
                if busyReviewId == operationId { busyReviewId = nil }
                releaseOperation()
            }
            do {
                try await repository.reviewCompletion(
                    review: review,
                    approve: approve,
                    qualityPercent: qualityPercent,
                    rejectionReason: rejectionReason
                )
                completionReviews.removeAll { $0.id == review.id }
                try await reloadAfterMutation()
            } catch {
                actionError = (error as? ConvexException)?.message
                    ?? ConvexHttpClient.humanize(error.localizedDescription)
            }
        }
    }

    private func complete(_ task: WorkTaskItem, qualityPercent: Int?) {
        busyTaskId = task.id
        actionError = nil
        Task {
            while operationBusy { try? await Task.sleep(nanoseconds: 50_000_000) }
            operationBusy = true
            defer {
                if busyTaskId == task.id { busyTaskId = nil }
                releaseOperation()
            }
            do {
                try await repository.complete(item: task, qualityPercent: qualityPercent)
                tasks = tasks.map {
                    guard $0.id == task.id else { return $0 }
                    var updated = $0
                    updated.status = qualityPercent == nil ? "pending_completion" : "completed"
                    return updated
                }
                try await reloadAfterMutation()
            } catch {
                actionError = (error as? ConvexException)?.message
                    ?? ConvexHttpClient.humanize(error.localizedDescription)
            }
        }
    }

    private func reloadAfterMutation() async throws {
        let snap = try await repository.listMine()
        isAdmin = snap.isAdmin
        accessLevel = snap.accessLevel
        tasks = snap.tasks
        approvals = snap.approvals
        completionReviews = snap.completionReviews
    }

    private func releaseOperation() {
        operationBusy = false
        if refreshPending {
            refreshPending = false
            refresh()
        }
    }
}
