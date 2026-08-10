import UIKit

@MainActor
final class DevicesViewController: UITableViewController {
    private enum ViewState {
        case loading
        case loaded([DeviceSession])
        case failed(String)
    }

    private enum SectionKind {
        case loading
        case error(String)
        case feedback(String, isError: Bool)
        case current(DeviceSession, hasOthers: Bool)
        case sessions([DeviceSession])
        case empty
    }

    private let sessionsRepository: SessionsRepository
    private var state: ViewState = .loading
    private var feedback: (message: String, isError: Bool)?
    private var isPending = false
    private var loadTask: Task<Void, Never>?
    private let referenceDate = Date()

    init(sessionsRepository: SessionsRepository) {
        self.sessionsRepository = sessionsRepository
        super.init(style: .insetGrouped)
        title = "Thiết bị"
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    deinit { loadTask?.cancel() }

    override func viewDidLoad() {
        super.viewDidLoad()
        navigationItem.largeTitleDisplayMode = .never
        tableView.backgroundColor = .systemGroupedBackground
        tableView.cellLayoutMarginsFollowReadableWidth = true
        tableView.register(UITableViewCell.self, forCellReuseIdentifier: "Cell")
        refreshControl = UIRefreshControl()
        refreshControl?.accessibilityLabel = "Tải lại phiên đăng nhập"
        refreshControl?.addTarget(self, action: #selector(refresh), for: .valueChanged)
        loadSessions(showLoading: true)
    }

    override func numberOfSections(in tableView: UITableView) -> Int {
        sectionKinds.count
    }

    override func tableView(_ tableView: UITableView, numberOfRowsInSection section: Int) -> Int {
        switch sectionKinds[section] {
        case .current(_, let hasOthers): return hasOthers ? 2 : 1
        case .sessions(let sessions): return max(sessions.count, 1)
        default: return 1
        }
    }

    override func tableView(_ tableView: UITableView, titleForHeaderInSection section: Int) -> String? {
        switch sectionKinds[section] {
        case .current: return "Thiết bị này"
        case .sessions: return "Phiên đăng nhập khác"
        default: return nil
        }
    }

    override func tableView(_ tableView: UITableView, titleForFooterInSection section: Int) -> String? {
        switch sectionKinds[section] {
        case .current:
            return "Phiên hiện tại được bảo vệ và không thể thu hồi tại đây."
        case .sessions:
            return "Thu hồi phiên sẽ đăng xuất thiết bị và ngừng nhận thông báo trên thiết bị đó."
        default:
            return nil
        }
    }

    override func tableView(
        _ tableView: UITableView,
        cellForRowAt indexPath: IndexPath
    ) -> UITableViewCell {
        let cell = tableView.dequeueReusableCell(withIdentifier: "Cell", for: indexPath)
        reset(cell)

        switch sectionKinds[indexPath.section] {
        case .loading:
            configureLoading(cell)
        case .error(let message):
            configureError(cell, message: message)
        case .feedback(let message, let isError):
            configureFeedback(cell, message: message, isError: isError)
        case .current(let session, let hasOthers):
            if indexPath.row == 0 {
                configureSession(cell, session: session, allowsRevoke: false)
            } else if hasOthers {
                configureRevokeOthers(cell)
            }
        case .sessions(let sessions):
            if sessions.isEmpty {
                configureEmpty(cell, text: "Không có phiên đăng nhập nào khác.")
            } else {
                configureSession(cell, session: sessions[indexPath.row], allowsRevoke: true)
            }
        case .empty:
            configureEmpty(cell, text: "Không tìm thấy phiên đăng nhập nào.")
        }
        return cell
    }

    override func tableView(_ tableView: UITableView, didSelectRowAt indexPath: IndexPath) {
        tableView.deselectRow(at: indexPath, animated: true)
        switch sectionKinds[indexPath.section] {
        case .error:
            loadSessions(showLoading: true)
        case .current(_, let hasOthers) where hasOthers && indexPath.row == 1:
            confirmRevokeOthers()
        default:
            break
        }
    }

    private var sectionKinds: [SectionKind] {
        switch state {
        case .loading:
            return [.loading]
        case .failed(let message):
            return [.error(message)]
        case .loaded(let sessions):
            var result: [SectionKind] = []
            if let feedback {
                result.append(.feedback(feedback.message, isError: feedback.isError))
            }
            guard !sessions.isEmpty else {
                result.append(.empty)
                return result
            }
            let current = sessions.first(where: \DeviceSession.isCurrent)
            let others = sessions.filter { !$0.isCurrent }
            if let current {
                result.append(.current(current, hasOthers: !others.isEmpty))
            }
            result.append(.sessions(others))
            return result
        }
    }

    private func reset(_ cell: UITableViewCell) {
        cell.accessoryType = .none
        cell.accessoryView = nil
        cell.selectionStyle = .none
        cell.isUserInteractionEnabled = true
        cell.accessibilityLabel = nil
        cell.accessibilityHint = nil
        cell.accessibilityTraits = []
        var content = cell.defaultContentConfiguration()
        content.textProperties.numberOfLines = 0
        content.secondaryTextProperties.numberOfLines = 0
        cell.contentConfiguration = content
    }

    private func configureLoading(_ cell: UITableViewCell) {
        var content = cell.defaultContentConfiguration()
        content.text = "Đang tải phiên đăng nhập…"
        content.textProperties.color = .secondaryLabel
        let indicator = UIActivityIndicatorView(style: .medium)
        indicator.startAnimating()
        indicator.accessibilityLabel = "Đang tải"
        cell.contentConfiguration = content
        cell.accessoryView = indicator
        cell.accessibilityLabel = "Đang tải phiên đăng nhập"
    }

    private func configureError(_ cell: UITableViewCell, message: String) {
        var content = cell.defaultContentConfiguration()
        content.text = "Không thể tải phiên đăng nhập"
        content.secondaryText = message
        content.image = UIImage(systemName: "exclamationmark.triangle.fill")
        content.imageProperties.tintColor = .systemRed
        cell.contentConfiguration = content
        cell.accessoryType = .disclosureIndicator
        cell.selectionStyle = .default
        cell.accessibilityLabel = "Không thể tải phiên đăng nhập. (message). Thử lại"
        cell.accessibilityTraits = .button
        cell.accessibilityHint = "Tải lại danh sách phiên đăng nhập"
    }

    private func configureFeedback(_ cell: UITableViewCell, message: String, isError: Bool) {
        var content = cell.defaultContentConfiguration()
        content.text = message
        content.textProperties.color = isError ? .systemRed : .systemGreen
        content.image = UIImage(systemName: isError ? "exclamationmark.circle.fill" : "checkmark.circle.fill")
        content.imageProperties.tintColor = isError ? .systemRed : .systemGreen
        cell.contentConfiguration = content
        cell.accessibilityLabel = message
        cell.accessibilityTraits = .staticText
    }

    private func configureSession(
        _ cell: UITableViewCell,
        session: DeviceSession,
        allowsRevoke: Bool
    ) {
        let activity = session.isCurrent ? "Thiết bị này" : formatActive(session.lastActiveAt)
        var content = cell.defaultContentConfiguration()
        content.text = session.deviceName
        content.secondaryText = "(session.platformLabel) · (activity)"
        content.image = UIImage(systemName: iconName(for: session.clientKind))
        content.imageProperties.tintColor = session.isCurrent ? .systemGreen : .systemIndigo
        content.imageProperties.maximumSize = CGSize(width: 32, height: 32)
        cell.contentConfiguration = content
        cell.accessibilityLabel = "(session.deviceName), (session.platformLabel), (activity)"

        guard allowsRevoke, !session.isCurrent else {
            cell.accessibilityTraits = session.isCurrent ? [.staticText, .selected] : .staticText
            return
        }
        let button = UIButton(type: .system, primaryAction: UIAction(title: "Thu hồi") { [weak self] _ in
            self?.confirmRevoke(session)
        })
        var configuration = UIButton.Configuration.plain()
        configuration.title = "Thu hồi"
        configuration.baseForegroundColor = .systemRed
        button.configuration = configuration
        button.titleLabel?.adjustsFontForContentSizeCategory = true
        button.isEnabled = !isPending
        button.accessibilityLabel = "Thu hồi phiên trên (session.deviceName)"
        button.accessibilityHint = "Yêu cầu xác nhận trước khi đăng xuất thiết bị"
        button.sizeToFit()
        cell.accessoryView = button
    }

    private func configureRevokeOthers(_ cell: UITableViewCell) {
        var content = cell.defaultContentConfiguration()
        content.text = isPending ? "Đang đăng xuất các phiên khác…" : "Đăng xuất tất cả phiên khác"
        content.secondaryText = "Giữ nguyên phiên trên thiết bị này"
        content.image = UIImage(systemName: "iphone.slash")
        content.imageProperties.tintColor = .systemRed
        content.textProperties.color = .systemRed
        cell.contentConfiguration = content
        cell.selectionStyle = isPending ? .none : .default
        cell.isUserInteractionEnabled = !isPending
        cell.accessibilityTraits = .button
        cell.accessibilityHint = "Yêu cầu xác nhận trước khi đăng xuất tất cả thiết bị khác"
    }

    private func configureEmpty(_ cell: UITableViewCell, text: String) {
        var content = cell.defaultContentConfiguration()
        content.text = text
        content.textProperties.color = .secondaryLabel
        content.image = UIImage(systemName: "checkmark.shield")
        content.imageProperties.tintColor = .secondaryLabel
        cell.contentConfiguration = content
        cell.accessibilityLabel = text
    }

    @objc private func refresh() {
        loadSessions(showLoading: false)
    }

    private func loadSessions(showLoading: Bool) {
        loadTask?.cancel()
        if showLoading {
            state = .loading
            feedback = nil
            tableView.reloadData()
        }
        loadTask = Task { [weak self] in
            guard let self else { return }
            do {
                let sessions = try await sessionsRepository.listMine()
                guard !Task.isCancelled else { return }
                state = .loaded(sessions)
            } catch {
                guard !Task.isCancelled else { return }
                state = .failed(displayMessage(for: error))
            }
            refreshControl?.endRefreshing()
            tableView.reloadData()
        }
    }

    private func confirmRevoke(_ session: DeviceSession) {
        guard !session.isCurrent, !isPending else { return }
        let alert = UIAlertController(
            title: "Thu hồi phiên?",
            message: "(session.deviceName) sẽ bị đăng xuất và ngừng nhận thông báo.",
            preferredStyle: .alert
        )
        alert.addAction(UIAlertAction(title: "Hủy", style: .cancel))
        alert.addAction(UIAlertAction(title: "Thu hồi", style: .destructive) { [weak self] _ in
            self?.revoke(session)
        })
        present(alert, animated: true)
    }

    private func confirmRevokeOthers() {
        guard !isPending else { return }
        let alert = UIAlertController(
            title: "Đăng xuất tất cả phiên khác?",
            message: "Tất cả thiết bị khác sẽ bị đăng xuất. Phiên trên thiết bị này được giữ nguyên.",
            preferredStyle: .alert
        )
        alert.addAction(UIAlertAction(title: "Hủy", style: .cancel))
        alert.addAction(UIAlertAction(title: "Đăng xuất", style: .destructive) { [weak self] _ in
            self?.revokeOthers()
        })
        present(alert, animated: true)
    }

    private func revoke(_ session: DeviceSession) {
        guard !session.isCurrent else { return }
        performMutation(successMessage: "Đã thu hồi phiên đăng nhập.") {
            try await self.sessionsRepository.revoke(sessionId: session.sessionId)
        }
    }

    private func revokeOthers() {
        performMutation(successMessage: "Đã đăng xuất tất cả phiên khác.") {
            try await self.sessionsRepository.revokeAllOthers()
        }
    }

    private func performMutation(
        successMessage: String,
        operation: @escaping () async throws -> Void
    ) {
        guard !isPending else { return }
        isPending = true
        feedback = nil
        tableView.reloadData()
        Task { [weak self] in
            guard let self else { return }
            do {
                try await operation()
                let sessions = try await sessionsRepository.listMine()
                feedback = (successMessage, false)
                state = .loaded(sessions)
                UIAccessibility.post(notification: .announcement, argument: successMessage)
            } catch {
                let message = displayMessage(for: error)
                feedback = (message, true)
                UIAccessibility.post(notification: .announcement, argument: message)
            }
            isPending = false
            tableView.reloadData()
        }
    }

    private func iconName(for kind: String) -> String {
        switch kind {
        case "ios": return "iphone"
        case "android": return "apps.iphone"
        case "web": return "laptopcomputer"
        default: return "display"
        }
    }

    private func formatActive(_ timestamp: TimeInterval) -> String {
        guard timestamp > 0 else { return "Không rõ lần hoạt động gần nhất" }
        let difference = max(0, referenceDate.timeIntervalSince1970 * 1_000 - timestamp)
        if difference < 120_000 { return "Đang trực tuyến" }
        let minutes = Int(difference / 60_000)
        if minutes < 60 { return "Hoạt động (minutes) phút trước" }
        let hours = minutes / 60
        if hours < 24 { return "Hoạt động (hours) giờ trước" }
        let days = hours / 24
        if days < 7 { return "Hoạt động (days) ngày trước" }
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "vi_VN")
        formatter.dateStyle = .short
        return "Hoạt động (formatter.string(from: Date(timeIntervalSince1970: timestamp / 1_000)))"
    }

    private func displayMessage(for error: Error) -> String {
        let convexError = error as? ConvexException
        let code = convexError?.code ?? ""
        if code.localizedCaseInsensitiveContains("CANNOT_REVOKE_CURRENT_SESSION") {
            return "Không thể thu hồi phiên đang dùng."
        }
        if code.localizedCaseInsensitiveContains("SESSION_NOT_FOUND") {
            return "Phiên đăng nhập không còn tồn tại. Hãy tải lại danh sách."
        }
        return convexError?.message ?? error.localizedDescription
    }
}
