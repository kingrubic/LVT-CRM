import Foundation
import Combine

@MainActor
final class NotificationsViewModel: ObservableObject {
    @Published private(set) var loading = true
    @Published private(set) var refreshing = false
    @Published private(set) var error: String?
    @Published private(set) var actionError: String?
    @Published private(set) var items: [NotificationItem] = []
    @Published private(set) var unreadCount = 0
    @Published private(set) var canDelete = false
    @Published private(set) var settings = NotificationSettings(
        dutiesEnabled: true,
        workEnabled: true,
        milestonesHours: []
    )
    @Published private(set) var busyKey: String?
    @Published var unreadOnly = false

    private let repository: NotificationsRepository
    private var operationBusy = false
    private var refreshPending = false
    private var cancellables = Set<AnyCancellable>()

    init(repository: NotificationsRepository) {
        self.repository = repository
        PushEvents.received
            .receive(on: DispatchQueue.main)
            .sink { [weak self] in self?.refresh() }
            .store(in: &cancellables)
        refresh(initial: true)
    }

    var visibleItems: [NotificationItem] {
        unreadOnly ? items.filter { !$0.read } : items
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
                try await loadSnapshot()
            } catch {
                self.error = (error as? ConvexException)?.message
                    ?? ConvexHttpClient.humanize(error.localizedDescription)
            }
        }
    }

    func open(_ item: NotificationItem, onOpened: (NotificationItem) -> Void) {
        onOpened(item)
        guard !item.read, !operationBusy else { return }
        operationBusy = true
        busyKey = item.key
        actionError = nil
        Task {
            defer {
                if busyKey == item.key { busyKey = nil }
                releaseOperation()
            }
            do {
                try await repository.markRead(notificationKey: item.key)
                items = items.map { $0.key == item.key ? mutated($0, read: true) : $0 }
                unreadCount = max(0, unreadCount - 1)
                try await loadSnapshot(keepBusy: true)
            } catch {
                showActionError(error)
            }
        }
    }

    func markAllRead() {
        let keys = items.filter { !$0.read }.map(\.key)
        guard !keys.isEmpty, !operationBusy else { return }
        operationBusy = true
        busyKey = "__all__"
        actionError = nil
        Task {
            defer {
                if busyKey == "__all__" { busyKey = nil }
                releaseOperation()
            }
            do {
                try await repository.markAllRead(notificationKeys: keys)
                items = items.map { mutated($0, read: true) }
                unreadCount = 0
                try await loadSnapshot(keepBusy: true)
            } catch {
                showActionError(error)
            }
        }
    }

    func dismiss(_ item: NotificationItem) {
        guard canDelete, !operationBusy else { return }
        operationBusy = true
        busyKey = item.key
        actionError = nil
        Task {
            defer {
                if busyKey == item.key { busyKey = nil }
                releaseOperation()
            }
            do {
                try await repository.dismiss(notificationKey: item.key)
                items.removeAll { $0.key == item.key }
                unreadCount = items.filter { !$0.read }.count
            } catch {
                showActionError(error)
            }
        }
    }

    private func loadSnapshot(keepBusy: Bool = false) async throws {
        let snap = try await repository.feed()
        items = snap.items
        unreadCount = snap.unreadCount
        canDelete = snap.canDelete
        settings = snap.settings
        loading = false
        refreshing = false
        if !keepBusy { busyKey = nil }
    }

    private func releaseOperation() {
        operationBusy = false
        if refreshPending {
            refreshPending = false
            refresh()
        }
    }

    private func showActionError(_ error: Error) {
        actionError = (error as? ConvexException)?.message
            ?? ConvexHttpClient.humanize(error.localizedDescription)
    }

    private func mutated(_ item: NotificationItem, read: Bool) -> NotificationItem {
        NotificationItem(
            key: item.key,
            kind: item.kind,
            sourceType: item.sourceType,
            sourceId: item.sourceId,
            title: item.title,
            description: item.description,
            dueAt: item.dueAt,
            milestoneHours: item.milestoneHours,
            milestoneLabel: item.milestoneLabel,
            read: read
        )
    }
}
