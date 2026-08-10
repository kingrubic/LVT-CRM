import Foundation

enum WorkAdminFilter: CaseIterable, Equatable {
    case all, pending, approved, pendingCompletion

    var title: String {
        switch self {
        case .all: return "Tất cả"
        case .pending: return "Chờ duyệt"
        case .approved: return "Đã duyệt"
        case .pendingCompletion: return "Chờ xác nhận"
        }
    }
}

@MainActor
final class WorkViewModel {
    private(set) var loading = true
    private(set) var refreshing = false
    private(set) var error: String?
    private(set) var actionError: String?
    private(set) var isAdmin = false
    private(set) var accessLevel = 0
    private(set) var tasks: [WorkTaskItem] = []
    private(set) var approvals: [WorkApprovalItem] = []
    private(set) var completionReviews: [WorkCompletionReviewItem] = []
    private(set) var busyTaskId: String?
    private(set) var busyApprovalId: String?
    private(set) var busyReviewId: String?
    var pendingOnly = false { didSet { if pendingOnly != oldValue { notifyChange() } } }
    var adminFilter: WorkAdminFilter = .all { didSet { if adminFilter != oldValue { notifyChange() } } }
    var onChange: (() -> Void)?

    var canApprove: Bool { accessLevel >= 4 || isAdmin }

    var visibleApprovals: [WorkApprovalItem] {
        if isAdmin {
            switch adminFilter {
            case .all, .pendingCompletion: return approvals
            case .pending: return approvals.filter { $0.status == "pending" }
            case .approved: return approvals.filter { $0.status == "approved" }
            }
        }
        let sorted = approvals.sorted {
            let lhsOpen = $0.myDecision.isEmpty
            let rhsOpen = $1.myDecision.isEmpty
            if lhsOpen != rhsOpen { return lhsOpen && !rhsOpen }
            return $0.deadline < $1.deadline
        }
        return pendingOnly ? sorted.filter(\.myDecision.isEmpty) : sorted
    }

    var visibleTasks: [WorkTaskItem] {
        pendingOnly ? tasks.filter { WorkHelpers.needsCompletion($0.status) } : tasks
    }

    private let repository: WorkRepository
    private var operationBusy = false
    private var refreshPending = false
    private var task: Task<Void, Never>?

    init(repository: WorkRepository) {
        self.repository = repository
    }

    deinit { task?.cancel() }

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
        notifyChange()
        task = Task { [weak self] in
            guard let self else { return }
            defer { releaseOperation() }
            do {
                try await loadSnapshot()
            } catch is CancellationError {
                return
            } catch {
                loading = false
                refreshing = false
                self.error = errorMessage(error)
                notifyChange()
            }
        }
    }

    func task(id: String) -> WorkTaskItem? { tasks.first { $0.id == id } }

    func approval(focusId: String) -> WorkApprovalItem? {
        approvals.first { approval in
            approval.id == focusId || approval.assignments.contains { $0.id == focusId }
        }
    }

    func review(focusId: String) -> WorkCompletionReviewItem? {
        completionReviews.first { $0.id == focusId || $0.workItemId == focusId }
    }

    func complete(_ item: WorkTaskItem, qualityPercent: Int?) {
        guard busyTaskId == nil else { return }
        busyTaskId = item.id
        runMutation {
            try await self.repository.complete(item: item, qualityPercent: qualityPercent)
            self.tasks = self.tasks.map {
                guard $0.id == item.id else { return $0 }
                var updated = $0
                updated.status = qualityPercent == nil ? "pending_completion" : "completed"
                return updated
            }
        } finish: {
            if self.busyTaskId == item.id { self.busyTaskId = nil }
        }
    }

    func decideApproval(_ item: WorkApprovalItem, approve: Bool) {
        guard busyApprovalId == nil else { return }
        busyApprovalId = item.id
        runMutation {
            try await self.repository.decideApproval(documentId: item.id, approve: approve)
            self.approvals = self.approvals.map {
                guard $0.id == item.id else { return $0 }
                var updated = $0
                updated.myDecision = approve ? "approved" : "rejected"
                return updated
            }
        } finish: {
            if self.busyApprovalId == item.id { self.busyApprovalId = nil }
        }
    }

    func reviewCompletion(
        _ review: WorkCompletionReviewItem,
        approve: Bool,
        qualityPercent: Int? = nil,
        rejectionReason: String? = nil
    ) {
        guard busyReviewId == nil else { return }
        busyReviewId = review.id
        runMutation {
            try await self.repository.reviewCompletion(
                review: review,
                approve: approve,
                qualityPercent: qualityPercent,
                rejectionReason: rejectionReason
            )
            self.completionReviews.removeAll { $0.id == review.id }
        } finish: {
            if self.busyReviewId == review.id { self.busyReviewId = nil }
        }
    }

    func clearActionError() {
        actionError = nil
        notifyChange()
    }

    private func runMutation(
        operation: @escaping @MainActor () async throws -> Void,
        finish: @escaping @MainActor () -> Void
    ) {
        actionError = nil
        notifyChange()
        task = Task { [weak self] in
            guard let self else { return }
            while operationBusy {
                try? await Task.sleep(for: .milliseconds(50))
                guard !Task.isCancelled else { return }
            }
            operationBusy = true
            defer {
                finish()
                releaseOperation()
            }
            do {
                try await operation()
                notifyChange()
                do {
                    try await loadSnapshot()
                } catch {
                    actionError = "Đã lưu thay đổi, nhưng chưa tải lại được danh sách. Hãy làm mới."
                    notifyChange()
                }
            } catch is CancellationError {
                return
            } catch {
                actionError = errorMessage(error)
                notifyChange()
            }
        }
    }

    private func loadSnapshot() async throws {
        let snapshot = try await repository.listMine()
        isAdmin = snapshot.isAdmin
        accessLevel = snapshot.accessLevel
        tasks = snapshot.tasks
        approvals = snapshot.approvals
        completionReviews = snapshot.completionReviews
        loading = false
        refreshing = false
        notifyChange()
    }

    private func releaseOperation() {
        operationBusy = false
        if refreshPending {
            refreshPending = false
            refresh()
        } else {
            notifyChange()
        }
    }

    private func errorMessage(_ error: Error) -> String {
        (error as? ConvexException)?.message ?? ConvexHttpClient.humanize(error.localizedDescription)
    }

    private func notifyChange() { onChange?() }
}
