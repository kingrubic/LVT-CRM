import Foundation

enum WorkListTab: Int, CaseIterable, Equatable {
    case incomplete
    case completed
    case upcoming
    case overdue

    var title: String {
        switch self {
        case .incomplete: return "Chưa hoàn thành"
        case .completed: return "Đã hoàn thành"
        case .upcoming: return "Chưa đến hạn"
        case .overdue: return "Đã quá hạn"
        }
    }
}

enum WorkDashboardFilter: Equatable {
    case pendingApproval
    case needsExecution
}

enum WorkListRules {
    private static let completed: Set<String> = ["completed", "completed_late"]

    static func vietnamToday(_ now: Date = Date()) -> String {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(secondsFromGMT: 7 * 3600) ?? .current
        let parts = calendar.dateComponents([.year, .month, .day], from: now)
        return String(format: "%04d-%02d-%02d", parts.year ?? 0, parts.month ?? 0, parts.day ?? 0)
    }

    static func isTaskCompleted(_ task: WorkTaskItem) -> Bool {
        completed.contains(task.status)
    }

    static func isDocumentCompleted(_ document: WorkApprovalItem) -> Bool {
        if completed.contains(document.status) { return true }
        let assignmentStatuses = document.assignments.map(\.status)
        return !assignmentStatuses.isEmpty && assignmentStatuses.allSatisfy { completed.contains($0) }
    }

    static func isTaskOverdue(_ task: WorkTaskItem, today: String = vietnamToday()) -> Bool {
        if isTaskCompleted(task) { return false }
        guard !task.deadline.isEmpty else { return false }
        return task.deadline < today
    }

    static func isDocumentOverdue(_ document: WorkApprovalItem, today: String = vietnamToday()) -> Bool {
        if isDocumentCompleted(document) { return false }
        var deadlines = document.assignments.map(\.deadline).filter { !$0.isEmpty }
        if deadlines.isEmpty, !document.deadline.isEmpty { deadlines = [document.deadline] }
        guard !deadlines.isEmpty else { return false }
        return deadlines.allSatisfy { $0 < today }
    }

    static func isTaskPast(_ task: WorkTaskItem, today: String = vietnamToday()) -> Bool {
        if isTaskCompleted(task) { return true }
        return isTaskOverdue(task, today: today)
    }

    static func isDocumentPast(_ document: WorkApprovalItem, today: String = vietnamToday()) -> Bool {
        if isDocumentCompleted(document) { return true }
        return isDocumentOverdue(document, today: today)
    }

    static func filterTasks(_ list: [WorkTaskItem], tab: WorkListTab, today: String = vietnamToday()) -> [WorkTaskItem] {
        let filtered: [WorkTaskItem]
        switch tab {
        case .completed:
            filtered = list.filter { isTaskCompleted($0) }
        case .overdue:
            filtered = list.filter { isTaskOverdue($0, today: today) }
        case .upcoming:
            filtered = list.filter { !isTaskCompleted($0) && !isTaskOverdue($0, today: today) }
        case .incomplete:
            filtered = list.filter { !isTaskCompleted($0) }
        }
        return filtered.sorted { $0.deadline < $1.deadline }
    }

    static func filterDocuments(_ list: [WorkApprovalItem], tab: WorkListTab, today: String = vietnamToday()) -> [WorkApprovalItem] {
        let filtered: [WorkApprovalItem]
        switch tab {
        case .completed:
            filtered = list.filter { isDocumentCompleted($0) }
        case .overdue:
            filtered = list.filter { isDocumentOverdue($0, today: today) }
        case .upcoming:
            filtered = list.filter { !isDocumentCompleted($0) && !isDocumentOverdue($0, today: today) }
        case .incomplete:
            filtered = list.filter { !isDocumentCompleted($0) }
        }
        return filtered.sorted {
            deadlineKey($0) < deadlineKey($1)
        }
    }

    static func tab(for task: WorkTaskItem, today: String = vietnamToday()) -> WorkListTab {
        if isTaskCompleted(task) { return .completed }
        if isTaskOverdue(task, today: today) { return .overdue }
        return .incomplete
    }

    static func tab(for document: WorkApprovalItem, today: String = vietnamToday()) -> WorkListTab {
        if isDocumentCompleted(document) { return .completed }
        if isDocumentOverdue(document, today: today) { return .overdue }
        return .incomplete
    }

    static func filterTasksBySearch(_ list: [WorkTaskItem], search: ListSearchValues) -> [WorkTaskItem] {
        let query = ListSearch.normalize(search.query)
        let department = ListSearch.normalize(search.department)
        let person = ListSearch.normalize(search.person)
        let dateFrom = search.dateFrom.trimmingCharacters(in: .whitespacesAndNewlines)
        let dateTo = search.dateTo.trimmingCharacters(in: .whitespacesAndNewlines)
        if query.isEmpty && department.isEmpty && person.isEmpty && dateFrom.isEmpty && dateTo.isEmpty {
            return list
        }
        return list.filter { task in
            let queryText = [task.title, task.documentTitle, task.fileName, task.documentContent].joined(separator: " ")
            if !query.isEmpty && !ListSearch.includes(queryText, query) { return false }
            if !ListSearch.includes(task.departmentName, department) { return false }
            if !ListSearch.includes(task.memberNames.joined(separator: " "), person) { return false }
            return ListSearch.anyDate([task.deadline], dateFrom: dateFrom, dateTo: dateTo)
        }
    }

    static func filterDocumentsBySearch(_ list: [WorkApprovalItem], search: ListSearchValues) -> [WorkApprovalItem] {
        let query = ListSearch.normalize(search.query)
        let department = ListSearch.normalize(search.department)
        let person = ListSearch.normalize(search.person)
        let dateFrom = search.dateFrom.trimmingCharacters(in: .whitespacesAndNewlines)
        let dateTo = search.dateTo.trimmingCharacters(in: .whitespacesAndNewlines)
        if query.isEmpty && department.isEmpty && person.isEmpty && dateFrom.isEmpty && dateTo.isEmpty {
            return list
        }
        return list.filter { document in
            let queryText = ([document.fileName, document.content] + document.assignments.map(\.content)).joined(separator: " ")
            let departmentText = document.assignments.map(\.departmentName).joined(separator: " ")
            let personText = document.assignments.flatMap { $0.members.map(\.name) }.joined(separator: " ")
            var deadlines = document.assignments.map(\.deadline).filter { !$0.isEmpty }
            if deadlines.isEmpty, !document.deadline.isEmpty { deadlines = [document.deadline] }
            if !query.isEmpty && !ListSearch.includes(queryText, query) { return false }
            if !ListSearch.includes(departmentText, department) { return false }
            if !ListSearch.includes(personText, person) { return false }
            return ListSearch.anyDate(deadlines, dateFrom: dateFrom, dateTo: dateTo)
        }
    }

    private static func deadlineKey(_ document: WorkApprovalItem) -> String {
        document.assignments.map(\.deadline).filter { !$0.isEmpty }.min() ?? document.deadline
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
    var mineTab: WorkListTab = .incomplete { didSet { if mineTab != oldValue { notifyChange() } } }
    var createdTab: WorkListTab = .incomplete { didSet { if createdTab != oldValue { notifyChange() } } }
    var showNeedsCompletionOnly = false
    var search = ListSearchValues() { didSet { if search != oldValue { notifyChange() } } }
    var onChange: (() -> Void)?

    var canApprove: Bool { false }

    var tabMine: [WorkTaskItem] {
        if showNeedsCompletionOnly {
            return tasks.filter { WorkHelpers.needsCompletion($0.status) }.sorted { $0.deadline < $1.deadline }
        }
        return WorkListRules.filterTasks(tasks, tab: mineTab)
    }

    var tabCreated: [WorkApprovalItem] {
        WorkListRules.filterDocuments(approvals, tab: createdTab)
    }

    var visibleMine: [WorkTaskItem] {
        WorkListRules.filterTasksBySearch(tabMine, search: search)
    }

    var visibleCreated: [WorkApprovalItem] {
        WorkListRules.filterDocumentsBySearch(tabCreated, search: search)
    }

    var mineSearchEmpty: Bool { !tabMine.isEmpty && visibleMine.isEmpty }
    var createdSearchEmpty: Bool { !tabCreated.isEmpty && visibleCreated.isEmpty }
    var incompleteMineCount: Int {
        if showNeedsCompletionOnly {
            return tasks.filter { WorkHelpers.needsCompletion($0.status) }.count
        }
        return tasks.filter { !WorkListRules.isTaskCompleted($0) }.count
    }
    var incompleteCreatedCount: Int {
        approvals.filter { !WorkListRules.isDocumentCompleted($0) }.count
    }

    var visibleApprovals: [WorkApprovalItem] { visibleCreated }
    var visibleTasks: [WorkTaskItem] { visibleMine }

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

    func applyDashboardFilter(_ filter: WorkDashboardFilter) {
        switch filter {
        case .pendingApproval:
            showNeedsCompletionOnly = false
            mineTab = .incomplete
            createdTab = .incomplete
        case .needsExecution:
            showNeedsCompletionOnly = true
            mineTab = .incomplete
        }
        notifyChange()
    }

    func clearDashboardFilter() {
        showNeedsCompletionOnly = false
        mineTab = .incomplete
        notifyChange()
    }

    func complete(
        _ item: WorkTaskItem,
        qualityPercent: Int?,
        fileData: Data? = nil,
        fileName: String? = nil,
        mimeType: String? = nil,
        note: String? = nil
    ) {
        guard busyTaskId == nil else { return }
        busyTaskId = item.id
        runMutation {
            var evidence: WorkUploadedEvidence? = nil
            if let fileData, let fileName, let mimeType {
                evidence = try await self.repository.uploadEvidence(
                    fileData: fileData,
                    fileName: fileName,
                    mimeType: mimeType
                )
            }
            try await self.repository.complete(item: item, qualityPercent: qualityPercent, evidence: evidence, note: note)
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
