import Foundation

@MainActor
final class NotificationsViewModel {
    private(set) var loading = true
    private(set) var refreshing = false
    private(set) var error: String?
    private(set) var actionError: String?
    private(set) var items: [NotificationItem] = []
    private(set) var unreadCount = 0
    private(set) var canDelete = false
    private(set) var settings = NotificationSettings(
        dutiesEnabled: true,
        workEnabled: true,
        milestonesHours: []
    )
    private(set) var busyKey: String?
    var unreadOnly = false {
        didSet { if unreadOnly != oldValue { notifyChange() } }
    }
    var onChange: (() -> Void)?

    var visibleItems: [NotificationItem] {
        unreadOnly ? items.filter { !$0.read } : items
    }

    private let repository: NotificationsRepository
    private var operationBusy = false
    private var refreshPending = false
    private var task: Task<Void, Never>?

    init(repository: NotificationsRepository) {
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
                self.error = errorMessage(error)
                self.loading = false
                self.refreshing = false
                self.notifyChange()
            }
        }
    }

    func open(_ item: NotificationItem, onOpened: (NotificationItem) -> Void) {
        onOpened(item)
        guard !item.read, !operationBusy else { return }
        operationBusy = true
        busyKey = item.key
        actionError = nil
        notifyChange()
        task = Task { [weak self] in
            guard let self else { return }
            defer {
                if busyKey == item.key { busyKey = nil }
                releaseOperation()
            }
            do {
                try await repository.markRead(notificationKey: item.key)
                items = items.map { $0.key == item.key ? self.itemWithReadState($0, read: true) : $0 }
                unreadCount = max(0, unreadCount - 1)
                notifyChange()
                try await loadSnapshot()
            } catch is CancellationError {
                return
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
        notifyChange()
        task = Task { [weak self] in
            guard let self else { return }
            defer {
                if busyKey == "__all__" { busyKey = nil }
                releaseOperation()
            }
            do {
                try await repository.markAllRead(notificationKeys: keys)
                items = items.map { self.itemWithReadState($0, read: true) }
                unreadCount = 0
                notifyChange()
                try await loadSnapshot()
            } catch is CancellationError {
                return
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
        notifyChange()
        task = Task { [weak self] in
            guard let self else { return }
            defer {
                if busyKey == item.key { busyKey = nil }
                releaseOperation()
            }
            do {
                try await repository.dismiss(notificationKey: item.key)
                items.removeAll { $0.key == item.key }
                unreadCount = items.filter { !$0.read }.count
                notifyChange()
            } catch is CancellationError {
                return
            } catch {
                showActionError(error)
            }
        }
    }

    private func loadSnapshot() async throws {
        let snapshot = try await repository.feed()
        items = snapshot.items
        unreadCount = snapshot.unreadCount
        canDelete = snapshot.canDelete
        settings = snapshot.settings
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

    private func showActionError(_ error: Error) {
        actionError = errorMessage(error)
        notifyChange()
    }

    private func errorMessage(_ error: Error) -> String {
        (error as? ConvexException)?.message ?? ConvexHttpClient.humanize(error.localizedDescription)
    }

    private func itemWithReadState(_ item: NotificationItem, read: Bool) -> NotificationItem {
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

    private func notifyChange() {
        onChange?()
    }
}
