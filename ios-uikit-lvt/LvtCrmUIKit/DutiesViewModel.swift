import Foundation

enum DutyFilter: CaseIterable, Equatable {
    case all
    case ongoing
    case upcoming
    case ended

    var title: String {
        switch self {
        case .all: return "Tất cả"
        case .ongoing: return "Đang diễn ra"
        case .upcoming: return "Sắp tới"
        case .ended: return "Đã kết thúc"
        }
    }

    func includes(_ duty: DutyItem) -> Bool {
        switch self {
        case .all: return true
        case .ongoing: return duty.isOngoing
        case .upcoming: return duty.isUpcoming
        case .ended: return duty.isOverdue
        }
    }
}

@MainActor
final class DutiesViewModel {
    private(set) var loading = true
    private(set) var refreshing = false
    private(set) var error: String?
    private(set) var actionError: String?
    private(set) var attendanceConfirmationEnabled = false
    private(set) var duties: [DutyItem] = []
    private(set) var busyDutyId: String?
    var filter: DutyFilter = .all {
        didSet { if filter != oldValue { notifyChange() } }
    }
    var onChange: (() -> Void)?

    var visibleDuties: [DutyItem] {
        duties.filter(filter.includes)
    }

    private let repository: DutiesRepository
    private var operationBusy = false
    private var refreshPending = false
    private var task: Task<Void, Never>?

    init(repository: DutiesRepository) {
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
                self.loading = false
                self.refreshing = false
                self.error = errorMessage(error)
                self.notifyChange()
            }
        }
    }

    func setAttendance(dutyId: String, status: String) {
        guard busyDutyId == nil else { return }
        busyDutyId = dutyId
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
                if busyDutyId == dutyId { busyDutyId = nil }
                releaseOperation()
            }
            do {
                try await repository.setAttendance(dutyId: dutyId, status: status)
                duties = duties.map { duty in
                    guard duty.id == dutyId else { return duty }
                    var updated = duty
                    updated.myStatus = status
                    updated.canMarkAttendance = false
                    return updated
                }
                notifyChange()
                do {
                    try await loadSnapshot()
                } catch {
                    actionError = "Đã lưu xác nhận, nhưng chưa tải lại được danh sách. Hãy làm mới."
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

    func duty(id: String) -> DutyItem? {
        duties.first { $0.id == id }
    }

    func canMark(_ duty: DutyItem) -> Bool {
        attendanceConfirmationEnabled && duty.isMine && duty.canMarkAttendance
    }

    private func loadSnapshot() async throws {
        let snapshot = try await repository.listMine()
        attendanceConfirmationEnabled = snapshot.attendanceConfirmationEnabled
        duties = snapshot.duties
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

    private func notifyChange() {
        onChange?()
    }
}
