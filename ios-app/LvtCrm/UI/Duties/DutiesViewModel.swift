import Foundation

@MainActor
final class DutiesViewModel: ObservableObject {
    @Published private(set) var loading = true
    @Published private(set) var refreshing = false
    @Published private(set) var error: String?
    @Published private(set) var actionError: String?
    @Published private(set) var attendanceConfirmationEnabled = false
    @Published private(set) var duties: [DutyItem] = []
    @Published private(set) var busyDutyId: String?

    private let repository: DutiesRepository
    private var operationBusy = false
    private var refreshPending = false

    init(repository: DutiesRepository) {
        self.repository = repository
        refresh(initial: true)
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
                attendanceConfirmationEnabled = snap.attendanceConfirmationEnabled
                duties = snap.duties
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

    func setAttendance(dutyId: String, status: String) {
        busyDutyId = dutyId
        actionError = nil
        Task {
            while operationBusy { try? await Task.sleep(nanoseconds: 50_000_000) }
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
                do {
                    let snap = try await repository.listMine()
                    attendanceConfirmationEnabled = snap.attendanceConfirmationEnabled
                    duties = snap.duties
                } catch {
                    actionError = "Đã lưu xác nhận, nhưng chưa tải lại được danh sách. Hãy làm mới."
                }
            } catch {
                actionError = (error as? ConvexException)?.message
                    ?? ConvexHttpClient.humanize(error.localizedDescription)
            }
        }
    }

    private func releaseOperation() {
        operationBusy = false
        if refreshPending {
            refreshPending = false
            refresh()
        }
    }
}
