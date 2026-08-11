import UIKit

@MainActor
final class WorkViewController: UITableViewController {
    private enum SectionKind {
        case feedback(String)
        case loading
        case error(String)
        case reviewBanner(Int)
        case approvals([WorkApprovalItem])
        case tasks([WorkTaskItem])
        case reviews([WorkCompletionReviewItem])
    }

    private let viewModel: WorkViewModel
    private var pendingFocusId: String?

    init(viewModel: WorkViewModel) {
        self.viewModel = viewModel
        super.init(style: .insetGrouped)
        title = "Công việc"
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    override func viewDidLoad() {
        super.viewDidLoad()
        tableView.backgroundColor = .systemGroupedBackground
        tableView.cellLayoutMarginsFollowReadableWidth = true
        tableView.estimatedRowHeight = 150
        tableView.rowHeight = UITableView.automaticDimension
        tableView.register(WorkItemCell.self, forCellReuseIdentifier: WorkItemCell.reuseIdentifier)
        tableView.register(UITableViewCell.self, forCellReuseIdentifier: "StateCell")
        refreshControl = UIRefreshControl()
        refreshControl?.accessibilityLabel = "Tải lại danh sách công việc"
        refreshControl?.addTarget(self, action: #selector(refresh), for: .valueChanged)
        viewModel.onChange = { [weak self] in self?.render() }
        render()
        viewModel.refresh(initial: true)
    }

    override func numberOfSections(in tableView: UITableView) -> Int { sectionKinds.count }

    override func tableView(_ tableView: UITableView, numberOfRowsInSection section: Int) -> Int {
        switch sectionKinds[section] {
        case .approvals(let items): return max(items.count, 1)
        case .tasks(let items): return max(items.count, 1)
        case .reviews(let items): return max(items.count, 1)
        default: return 1
        }
    }

    override func tableView(_ tableView: UITableView, titleForHeaderInSection section: Int) -> String? {
        switch sectionKinds[section] {
        case .approvals: return viewModel.isAdmin ? "Công văn" : "Chờ duyệt"
        case .tasks: return "Nhiệm vụ"
        case .reviews: return "Chờ xác nhận hoàn thành"
        default: return nil
        }
    }

    override func tableView(
        _ tableView: UITableView,
        cellForRowAt indexPath: IndexPath
    ) -> UITableViewCell {
        switch sectionKinds[indexPath.section] {
        case .feedback(let message):
            return stateCell(indexPath, "Không thể cập nhật công việc", message, "exclamationmark.circle.fill", .systemRed)
        case .loading:
            let cell = stateCell(indexPath, "Đang tải công việc…", nil, nil, .secondaryLabel)
            let spinner = UIActivityIndicatorView(style: .medium)
            spinner.startAnimating()
            spinner.accessibilityLabel = "Đang tải"
            cell.accessoryView = spinner
            return cell
        case .error(let message):
            let cell = stateCell(indexPath, "Không thể tải công việc", message, "exclamationmark.triangle.fill", .systemRed)
            cell.accessoryType = .disclosureIndicator
            cell.selectionStyle = .default
            cell.accessibilityTraits = .button
            cell.accessibilityHint = "Tải lại danh sách công việc"
            return cell
        case .reviewBanner(let count):
            let cell = stateCell(
                indexPath,
                "\(count) hoàn thành chờ xác nhận",
                "Mở danh sách để đánh giá",
                "exclamationmark.bubble.fill",
                .systemOrange
            )
            cell.accessoryType = .disclosureIndicator
            cell.selectionStyle = .default
            cell.accessibilityTraits = .button
            return cell
        case .approvals(let items):
            guard !items.isEmpty else {
                return emptyCell(indexPath, "Không có công văn", "Danh sách phê duyệt trống.")
            }
            let item = items[indexPath.row]
            let cell = workCell(at: indexPath)
            cell.configureApproval(
                item,
                admin: viewModel.isAdmin,
                busy: viewModel.busyApprovalId == item.id,
                focused: isFocused(approval: item)
            ) { [weak self] action in
                guard let self else { return }
                if action == .detail { showDocument(item) }
                else { confirmApproval(item, approve: action == .approve) }
            }
            return cell
        case .tasks(let items):
            guard !items.isEmpty else {
                return emptyCell(indexPath, "Không có nhiệm vụ", "Bạn chưa được giao việc.")
            }
            let item = items[indexPath.row]
            let cell = workCell(at: indexPath)
            cell.configureTask(
                item,
                busy: viewModel.busyTaskId == item.id,
                focused: pendingFocusId == item.id
            ) { [weak self] in self?.confirmCompletion(item) }
            return cell
        case .reviews(let items):
            guard !items.isEmpty else {
                return emptyCell(indexPath, "Không có yêu cầu", "Không có hoàn thành nào chờ xác nhận.")
            }
            let item = items[indexPath.row]
            let cell = workCell(at: indexPath)
            cell.configureReview(item, busy: viewModel.busyReviewId == item.id) { [weak self] in
                self?.showReview(item)
            }
            return cell
        }
    }

    override func tableView(_ tableView: UITableView, didSelectRowAt indexPath: IndexPath) {
        tableView.deselectRow(at: indexPath, animated: true)
        switch sectionKinds[indexPath.section] {
        case .error:
            viewModel.refresh(initial: true)
        case .reviewBanner:
            viewModel.adminFilter = .pendingCompletion
        case .approvals(let items) where !items.isEmpty:
            showDocument(items[indexPath.row])
        case .tasks(let items) where !items.isEmpty:
            showTask(items[indexPath.row])
        case .reviews(let items) where !items.isEmpty:
            showReview(items[indexPath.row])
        default:
            break
        }
    }

    func focus(itemId: String) {
        loadViewIfNeeded()
        pendingFocusId = itemId
        if viewModel.isAdmin, viewModel.adminFilter != .all {
            viewModel.adminFilter = .all
        } else if viewModel.pendingOnly {
            viewModel.pendingOnly = false
        } else {
            render()
        }
    }

    private var sectionKinds: [SectionKind] {
        var sections: [SectionKind] = []
        if let actionError = viewModel.actionError { sections.append(.feedback(actionError)) }
        if let error = viewModel.error { return sections + [.error(error)] }
        if viewModel.loading { return sections + [.loading] }
        if viewModel.isAdmin, !viewModel.completionReviews.isEmpty,
           viewModel.adminFilter != .pendingCompletion {
            sections.append(.reviewBanner(viewModel.completionReviews.count))
        }
        if viewModel.isAdmin, viewModel.adminFilter == .pendingCompletion {
            sections.append(.reviews(viewModel.completionReviews))
            return sections
        }
        if viewModel.canApprove { sections.append(.approvals(viewModel.visibleApprovals)) }
        sections.append(.tasks(viewModel.visibleTasks))
        return sections
    }

    private func render() {
        navigationItem.rightBarButtonItem = UIBarButtonItem(
            title: filterTitle,
            image: UIImage(systemName: "line.3.horizontal.decrease.circle"),
            primaryAction: nil,
            menu: filterMenu()
        )
        navigationItem.rightBarButtonItem?.accessibilityLabel = "Lọc công việc. \(filterTitle)"
        if !viewModel.refreshing { refreshControl?.endRefreshing() }
        tableView.reloadData()
        processPendingFocusIfPossible()
    }

    private var filterTitle: String {
        viewModel.isAdmin ? viewModel.adminFilter.title : (viewModel.pendingOnly ? "Chờ xử lý" : "Tất cả")
    }

    private func filterMenu() -> UIMenu {
        if viewModel.isAdmin {
            return UIMenu(children: WorkAdminFilter.allCases.map { filter in
                UIAction(title: filter.title, state: viewModel.adminFilter == filter ? .on : .off) { [weak self] _ in
                    self?.pendingFocusId = nil
                    self?.viewModel.adminFilter = filter
                }
            })
        }
        return UIMenu(children: [
            UIAction(title: "Tất cả", state: viewModel.pendingOnly ? .off : .on) { [weak self] _ in
                self?.pendingFocusId = nil
                self?.viewModel.pendingOnly = false
            },
            UIAction(title: "Chỉ việc chờ xử lý", state: viewModel.pendingOnly ? .on : .off) { [weak self] _ in
                self?.pendingFocusId = nil
                self?.viewModel.pendingOnly = true
            },
        ])
    }

    private func processPendingFocusIfPossible() {
        guard let focusId = pendingFocusId, !viewModel.loading, viewModel.error == nil else { return }
        if let item = viewModel.approval(focusId: focusId) {
            scrollToApproval(item)
            pendingFocusId = nil
            DispatchQueue.main.async { [weak self] in self?.showDocument(item) }
        } else if let item = viewModel.task(id: focusId) {
            scrollToTask(item)
            pendingFocusId = nil
            DispatchQueue.main.async { [weak self] in self?.showTask(item) }
        } else if let item = viewModel.review(focusId: focusId) {
            pendingFocusId = nil
            viewModel.adminFilter = .pendingCompletion
            DispatchQueue.main.async { [weak self] in self?.showReview(item) }
        } else {
            pendingFocusId = nil
            presentMissingItemAlert()
        }
    }

    private func scrollToApproval(_ item: WorkApprovalItem) {
        guard let section = sectionKinds.firstIndex(where: { if case .approvals = $0 { true } else { false } }),
              let row = viewModel.visibleApprovals.firstIndex(where: { $0.id == item.id }) else { return }
        scrollAndAnnounce(IndexPath(row: row, section: section))
    }

    private func scrollToTask(_ item: WorkTaskItem) {
        guard let section = sectionKinds.firstIndex(where: { if case .tasks = $0 { true } else { false } }),
              let row = viewModel.visibleTasks.firstIndex(where: { $0.id == item.id }) else { return }
        scrollAndAnnounce(IndexPath(row: row, section: section))
    }

    private func scrollAndAnnounce(_ indexPath: IndexPath) {
        tableView.scrollToRow(at: indexPath, at: .middle, animated: !UIAccessibility.isReduceMotionEnabled)
        UIAccessibility.post(notification: .layoutChanged, argument: tableView.cellForRow(at: indexPath))
    }

    private func isFocused(approval: WorkApprovalItem) -> Bool {
        guard let pendingFocusId else { return false }
        return approval.id == pendingFocusId || approval.assignments.contains { $0.id == pendingFocusId }
    }

    private func confirmApproval(_ item: WorkApprovalItem, approve: Bool) {
        let alert = UIAlertController(
            title: approve ? "Duyệt công văn?" : "Từ chối công văn?",
            message: "Thao tác này không thể hoàn tác.",
            preferredStyle: .alert
        )
        alert.addAction(UIAlertAction(title: "Huỷ", style: .cancel))
        alert.addAction(UIAlertAction(title: approve ? "Duyệt" : "Từ chối", style: approve ? .default : .destructive) { [weak self] _ in
            self?.viewModel.decideApproval(item, approve: approve)
        })
        presentFromVisibleController(alert)
    }

    private func confirmCompletion(_ item: WorkTaskItem) {
        if item.isAdmin {
            presentQualityPrompt(item)
            return
        }
        let alert = UIAlertController(title: "Hoàn thành công việc?", message: nil, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "Huỷ", style: .cancel))
        alert.addAction(UIAlertAction(title: "Hoàn thành", style: .default) { [weak self] _ in
            self?.viewModel.complete(item, qualityPercent: nil)
        })
        presentFromVisibleController(alert)
    }

    private func presentQualityPrompt(_ item: WorkTaskItem) {
        let alert = UIAlertController(title: "Phần trăm chất lượng", message: "Nhập giá trị từ 0 đến 100.", preferredStyle: .alert)
        alert.addTextField {
            $0.placeholder = "0–100"
            $0.text = "100"
            $0.keyboardType = .numberPad
            $0.accessibilityLabel = "Phần trăm chất lượng"
        }
        alert.addAction(UIAlertAction(title: "Huỷ", style: .cancel))
        alert.addAction(UIAlertAction(title: "Xác nhận", style: .default) { [weak self, weak alert] _ in
            let value = Int(alert?.textFields?.first?.text ?? "") ?? -1
            guard (0...100).contains(value) else {
                self?.presentValidation("Phần trăm chất lượng phải từ 0 đến 100.")
                return
            }
            self?.viewModel.complete(item, qualityPercent: value)
        })
        presentFromVisibleController(alert)
    }

    private func showDocument(_ item: WorkApprovalItem) {
        navigationController?.pushViewController(WorkDocumentViewController(document: item), animated: !UIAccessibility.isReduceMotionEnabled)
    }

    private func showTask(_ item: WorkTaskItem) {
        let detail = WorkTaskDetailViewController(task: item, busy: viewModel.busyTaskId == item.id) { [weak self] in
            self?.confirmCompletion(item)
        }
        navigationController?.pushViewController(detail, animated: !UIAccessibility.isReduceMotionEnabled)
    }

    private func showReview(_ item: WorkCompletionReviewItem) {
        let controller = WorkReviewViewController(review: item) { [weak self] approve, quality, reason in
            self?.viewModel.reviewCompletion(item, approve: approve, qualityPercent: quality, rejectionReason: reason)
            self?.navigationController?.popViewController(animated: !UIAccessibility.isReduceMotionEnabled)
        }
        navigationController?.pushViewController(controller, animated: !UIAccessibility.isReduceMotionEnabled)
    }

    private func presentValidation(_ message: String) {
        let alert = UIAlertController(title: "Thông tin chưa hợp lệ", message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "Đóng", style: .default))
        presentFromVisibleController(alert)
    }

    private func presentMissingItemAlert() {
        let alert = UIAlertController(
            title: "Không tìm thấy công việc",
            message: "Mục này không còn tồn tại hoặc bạn không có quyền xem.",
            preferredStyle: .alert
        )
        alert.addAction(UIAlertAction(title: "Đóng", style: .default))
        presentFromVisibleController(alert)
    }

    private func presentFromVisibleController(_ alert: UIAlertController) {
        (navigationController?.visibleViewController ?? self).present(
            alert,
            animated: !UIAccessibility.isReduceMotionEnabled
        )
    }

    private func workCell(at indexPath: IndexPath) -> WorkItemCell {
        tableView.dequeueReusableCell(withIdentifier: WorkItemCell.reuseIdentifier, for: indexPath) as! WorkItemCell
    }

    private func emptyCell(_ indexPath: IndexPath, _ title: String, _ detail: String) -> UITableViewCell {
        stateCell(indexPath, title, detail, "tray", .secondaryLabel)
    }

    private func stateCell(
        _ indexPath: IndexPath,
        _ title: String,
        _ detail: String?,
        _ image: String?,
        _ color: UIColor
    ) -> UITableViewCell {
        let cell = tableView.dequeueReusableCell(withIdentifier: "StateCell", for: indexPath)
        cell.accessoryType = .none
        cell.accessoryView = nil
        cell.selectionStyle = .none
        cell.accessibilityTraits = .staticText
        var content = cell.defaultContentConfiguration()
        content.text = title
        content.secondaryText = detail
        content.textProperties.numberOfLines = 0
        content.secondaryTextProperties.numberOfLines = 0
        content.textProperties.color = color
        content.image = image.flatMap(UIImage.init(systemName:))
        content.imageProperties.tintColor = color
        cell.contentConfiguration = content
        cell.accessibilityLabel = [title, detail].compactMap { $0 }.joined(separator: ". ")
        return cell
    }

    @objc private func refresh() { viewModel.refresh() }
}

private enum WorkCellAction { case detail, approve, reject }

private final class WorkItemCell: UITableViewCell {
    static let reuseIdentifier = "WorkItemCell"
    private let statusLabel = UILabel()
    private let titleLabel = UILabel()
    private let detailLabel = UILabel()
    private let metaLabel = UILabel()
    private let reasonLabel = UILabel()
    private let actionButton = UIButton(type: .system)
    private let spinner = UIActivityIndicatorView(style: .medium)

    override init(style: UITableViewCell.CellStyle, reuseIdentifier: String?) {
        super.init(style: style, reuseIdentifier: reuseIdentifier)
        accessoryType = .disclosureIndicator
        titleLabel.font = .preferredFont(forTextStyle: .headline)
        detailLabel.font = .preferredFont(forTextStyle: .subheadline)
        metaLabel.font = .preferredFont(forTextStyle: .caption1)
        statusLabel.font = .preferredFont(forTextStyle: .caption1)
        reasonLabel.font = .preferredFont(forTextStyle: .caption1)
        [statusLabel, titleLabel, detailLabel, metaLabel, reasonLabel].forEach {
            $0.adjustsFontForContentSizeCategory = true
            $0.numberOfLines = 0
        }
        detailLabel.textColor = .secondaryLabel
        metaLabel.textColor = .secondaryLabel
        reasonLabel.textColor = .systemRed
        actionButton.titleLabel?.font = .preferredFont(forTextStyle: .body)
        actionButton.titleLabel?.adjustsFontForContentSizeCategory = true
        actionButton.configuration = .bordered()
        let actionRow = UIStackView(arrangedSubviews: [actionButton, spinner])
        actionRow.spacing = 8
        actionRow.alignment = .center
        let stack = UIStackView(arrangedSubviews: [statusLabel, titleLabel, detailLabel, metaLabel, reasonLabel, actionRow])
        stack.axis = .vertical
        stack.alignment = .leading
        stack.spacing = 7
        stack.translatesAutoresizingMaskIntoConstraints = false
        contentView.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.leadingAnchor.constraint(equalTo: contentView.layoutMarginsGuide.leadingAnchor),
            stack.trailingAnchor.constraint(equalTo: contentView.layoutMarginsGuide.trailingAnchor),
            stack.topAnchor.constraint(equalTo: contentView.layoutMarginsGuide.topAnchor),
            stack.bottomAnchor.constraint(equalTo: contentView.layoutMarginsGuide.bottomAnchor),
        ])
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    override func prepareForReuse() {
        super.prepareForReuse()
        actionButton.menu = nil
        actionButton.removeTarget(nil, action: nil, for: .allEvents)
        actionButton.isHidden = false
        reasonLabel.isHidden = true
        spinner.stopAnimating()
        backgroundColor = .secondarySystemGroupedBackground
    }

    func configureApproval(
        _ item: WorkApprovalItem,
        admin: Bool,
        busy: Bool,
        focused: Bool,
        action: @escaping (WorkCellAction) -> Void
    ) {
        statusLabel.text = item.status == "pending" ? "Chờ duyệt · \(item.approvalCount)/\(item.approvalTotal)" : "\(item.status) · \(item.approvalCount)/\(item.approvalTotal)"
        statusLabel.textColor = item.status == "pending" ? .systemOrange : .systemGreen
        titleLabel.text = item.fileName.isEmpty ? item.content : item.fileName
        detailLabel.text = item.fileName.isEmpty ? nil : item.content
        detailLabel.isHidden = detailLabel.text?.isEmpty != false
        metaLabel.text = "Hạn: \(item.deadline)"
        reasonLabel.isHidden = true
        backgroundColor = focused ? UIColor.systemIndigo.withAlphaComponent(0.12) : .secondarySystemGroupedBackground
        if admin {
            setButton("Xem phân công", busy: busy) { action(.detail) }
        } else if item.myDecision.isEmpty {
            actionButton.configuration = .borderedProminent()
            actionButton.setTitle("Xử lý", for: .normal)
            actionButton.showsMenuAsPrimaryAction = true
            actionButton.menu = UIMenu(children: [
                UIAction(title: "Duyệt", image: UIImage(systemName: "checkmark.circle")) { _ in action(.approve) },
                UIAction(title: "Từ chối", image: UIImage(systemName: "xmark.circle"), attributes: .destructive) { _ in action(.reject) },
            ])
            actionButton.isEnabled = !busy
            busy ? spinner.startAnimating() : spinner.stopAnimating()
        } else {
            actionButton.isHidden = true
            statusLabel.text = item.myDecision == "approved" ? "Bạn đã duyệt" : "Bạn đã từ chối"
            statusLabel.textColor = item.myDecision == "approved" ? .systemGreen : .systemRed
        }
        accessibilityLabel = [statusLabel.text, titleLabel.text, detailLabel.text, metaLabel.text].compactMap { $0 }.joined(separator: ". ")
    }

    func configureTask(_ item: WorkTaskItem, busy: Bool, focused: Bool, complete: @escaping () -> Void) {
        statusLabel.text = WorkPresentation.status(item.status) + (item.qualityPercent.map { " · \($0)%" } ?? "")
        statusLabel.textColor = WorkPresentation.statusColor(item.status)
        titleLabel.text = item.title
        detailLabel.text = item.documentContent
        detailLabel.isHidden = item.documentContent.isEmpty
        metaLabel.text = "\(item.departmentName) · Hạn \(item.deadline)"
        reasonLabel.text = item.rejectionReason.isEmpty ? nil : "Lý do từ chối: \(item.rejectionReason)"
        reasonLabel.isHidden = item.rejectionReason.isEmpty
        backgroundColor = focused ? UIColor.systemIndigo.withAlphaComponent(0.12) : .secondarySystemGroupedBackground
        if WorkHelpers.needsCompletion(item.status) {
            actionButton.configuration = .borderedProminent()
            setButton("Hoàn thành", busy: busy, action: complete)
        } else {
            actionButton.isHidden = true
        }
        accessibilityLabel = [statusLabel.text, titleLabel.text, detailLabel.text, metaLabel.text, reasonLabel.text].compactMap { $0 }.joined(separator: ". ")
    }

    func configureReview(_ item: WorkCompletionReviewItem, busy: Bool, review: @escaping () -> Void) {
        statusLabel.text = "Chờ xác nhận"
        statusLabel.textColor = .systemOrange
        titleLabel.text = item.userName
        detailLabel.text = item.content
        detailLabel.isHidden = false
        metaLabel.text = "\(item.departmentName) · Hạn \(item.deadline)"
        reasonLabel.isHidden = true
        actionButton.configuration = .borderedProminent()
        setButton("Đánh giá", busy: busy, action: review)
        accessibilityLabel = "Chờ xác nhận. \(item.userName). \(item.content). \(metaLabel.text ?? "")"
    }

    private func setButton(_ title: String, busy: Bool, action: @escaping () -> Void) {
        actionButton.isHidden = false
        actionButton.setTitle(title, for: .normal)
        actionButton.isEnabled = !busy
        actionButton.addAction(UIAction { _ in action() }, for: .touchUpInside)
        busy ? spinner.startAnimating() : spinner.stopAnimating()
    }
}

enum WorkPresentation {
    static func status(_ status: String) -> String {
        switch status {
        case "pending_task", "pending": return "Chờ làm"
        case "overdue": return "Quá hạn"
        case "pending_completion": return "Chờ xác nhận"
        case "completed": return "Hoàn thành"
        case "rejected", "rejected_completion": return "Bị từ chối"
        default: return status
        }
    }

    static func statusColor(_ status: String) -> UIColor {
        switch status {
        case "completed": return .systemGreen
        case "overdue", "rejected", "rejected_completion": return .systemRed
        case "pending_completion": return .systemOrange
        default: return .systemIndigo
        }
    }
}

private final class WorkTaskDetailViewController: UIViewController {
    private let task: WorkTaskItem
    private let busy: Bool
    private let onComplete: () -> Void

    init(task: WorkTaskItem, busy: Bool, onComplete: @escaping () -> Void) {
        self.task = task
        self.busy = busy
        self.onComplete = onComplete
        super.init(nibName: nil, bundle: nil)
        title = "Chi tiết nhiệm vụ"
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemGroupedBackground
        let rows = [
            label(task.title, .title2, .label),
            label(WorkPresentation.status(task.status), .headline, WorkPresentation.statusColor(task.status)),
            label(task.documentContent, .body, .secondaryLabel),
            label("Đơn vị: \(task.departmentName)", .body, .secondaryLabel),
            label("Hạn: \(task.deadline)", .body, .secondaryLabel),
            label(task.qualityPercent.map { "Chất lượng: \($0)%" } ?? "", .body, .secondaryLabel),
            label(task.rejectionReason.isEmpty ? "" : "Lý do từ chối: \(task.rejectionReason)", .body, .systemRed),
        ].filter { $0.text?.isEmpty == false }
        let stack = UIStackView(arrangedSubviews: rows)
        stack.axis = .vertical
        stack.spacing = 14
        if WorkHelpers.needsCompletion(task.status) {
            let button = UIButton(type: .system)
            button.configuration = .filled()
            button.configuration?.title = busy ? "Đang xử lý…" : "Hoàn thành"
            button.isEnabled = !busy
            button.addAction(UIAction { [weak self] _ in self?.onComplete() }, for: .touchUpInside)
            stack.addArrangedSubview(button)
        }
        embed(stack)
    }

    private func label(_ text: String, _ style: UIFont.TextStyle, _ color: UIColor) -> UILabel {
        let label = UILabel()
        label.text = text
        label.font = .preferredFont(forTextStyle: style)
        label.adjustsFontForContentSizeCategory = true
        label.textColor = color
        label.numberOfLines = 0
        return label
    }

    private func embed(_ stack: UIStackView) {
        let scroll = UIScrollView()
        scroll.translatesAutoresizingMaskIntoConstraints = false
        stack.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(scroll)
        scroll.addSubview(stack)
        NSLayoutConstraint.activate([
            scroll.leadingAnchor.constraint(equalTo: view.leadingAnchor), scroll.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            scroll.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor), scroll.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            stack.leadingAnchor.constraint(equalTo: scroll.frameLayoutGuide.leadingAnchor, constant: 20),
            stack.trailingAnchor.constraint(equalTo: scroll.frameLayoutGuide.trailingAnchor, constant: -20),
            stack.topAnchor.constraint(equalTo: scroll.contentLayoutGuide.topAnchor, constant: 20),
            stack.bottomAnchor.constraint(equalTo: scroll.contentLayoutGuide.bottomAnchor, constant: -20),
        ])
    }
}

private final class WorkDocumentViewController: UITableViewController {
    private let document: WorkApprovalItem
    private let groupedAssignments: [(String, [WorkDocumentAssignment])]

    init(document: WorkApprovalItem) {
        self.document = document
        groupedAssignments = Dictionary(grouping: document.assignments, by: \.departmentName)
            .map { ($0.key, $0.value) }.sorted { $0.0 < $1.0 }
        super.init(style: .insetGrouped)
        title = "Chi tiết công văn"
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    override func viewDidLoad() {
        super.viewDidLoad()
        tableView.cellLayoutMarginsFollowReadableWidth = true
        tableView.rowHeight = UITableView.automaticDimension
        tableView.register(UITableViewCell.self, forCellReuseIdentifier: "DocumentCell")
    }

    override func numberOfSections(in tableView: UITableView) -> Int { 1 + groupedAssignments.count }

    override func tableView(_ tableView: UITableView, numberOfRowsInSection section: Int) -> Int {
        section == 0 ? 1 : groupedAssignments[section - 1].1.count
    }

    override func tableView(_ tableView: UITableView, titleForHeaderInSection section: Int) -> String? {
        section == 0 ? "Công văn" : groupedAssignments[section - 1].0
    }

    override func tableView(_ tableView: UITableView, cellForRowAt indexPath: IndexPath) -> UITableViewCell {
        let cell = tableView.dequeueReusableCell(withIdentifier: "DocumentCell", for: indexPath)
        cell.selectionStyle = .none
        var content = cell.defaultContentConfiguration()
        content.textProperties.numberOfLines = 0
        content.secondaryTextProperties.numberOfLines = 0
        if indexPath.section == 0 {
            content.text = document.fileName.isEmpty ? document.content : document.fileName
            let body = document.fileName.isEmpty ? "" : document.content
            content.secondaryText = [body, "Hạn: \(document.deadline)", "Phê duyệt: \(document.approvalCount)/\(document.approvalTotal)"].filter { !$0.isEmpty }.joined(separator: "\n")
            content.image = UIImage(systemName: document.fileName.isEmpty ? "doc.text" : "doc")
        } else {
            let assignment = groupedAssignments[indexPath.section - 1].1[indexPath.row]
            content.text = assignment.content
            let members = assignment.members.map { "\($0.name): \($0.status)" }.joined(separator: "\n")
            content.secondaryText = ["Hạn: \(assignment.deadline)", members].filter { !$0.isEmpty }.joined(separator: "\n")
            content.image = UIImage(systemName: "person.2")
        }
        content.imageProperties.tintColor = .systemIndigo
        cell.contentConfiguration = content
        cell.accessibilityLabel = [content.text, content.secondaryText].compactMap { $0 }.joined(separator: ". ")
        return cell
    }
}

private final class WorkReviewViewController: UIViewController, UITextViewDelegate {
    private let review: WorkCompletionReviewItem
    private let onSubmit: (Bool, Int?, String?) -> Void
    private let decision = UISegmentedControl(items: ["Duyệt", "Từ chối"])
    private let qualityField = UITextField()
    private let reasonView = UITextView()
    private let fieldLabel = UILabel()

    init(review: WorkCompletionReviewItem, onSubmit: @escaping (Bool, Int?, String?) -> Void) {
        self.review = review
        self.onSubmit = onSubmit
        super.init(nibName: nil, bundle: nil)
        title = "Đánh giá"
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemGroupedBackground
        navigationItem.rightBarButtonItem = UIBarButtonItem(title: "Gửi", style: .prominent, target: self, action: #selector(submit))
        decision.selectedSegmentIndex = 0
        decision.selectedSegmentTintColor = .systemIndigo
        decision.addTarget(self, action: #selector(decisionChanged), for: .valueChanged)
        qualityField.borderStyle = .roundedRect
        qualityField.keyboardType = .numberPad
        qualityField.text = "100"
        qualityField.placeholder = "0–100"
        qualityField.font = .preferredFont(forTextStyle: .body)
        qualityField.adjustsFontForContentSizeCategory = true
        qualityField.accessibilityLabel = "Phần trăm chất lượng"
        reasonView.font = .preferredFont(forTextStyle: .body)
        reasonView.adjustsFontForContentSizeCategory = true
        reasonView.layer.borderWidth = 1
        reasonView.layer.borderColor = UIColor.separator.cgColor
        reasonView.layer.cornerRadius = 8
        reasonView.heightAnchor.constraint(greaterThanOrEqualToConstant: 110).isActive = true
        reasonView.accessibilityLabel = "Lý do từ chối"
        fieldLabel.font = .preferredFont(forTextStyle: .headline)
        fieldLabel.adjustsFontForContentSizeCategory = true
        let summary = UILabel()
        summary.text = "\(review.userName)\n\(review.content)\n\(review.departmentName) · Hạn \(review.deadline)"
        summary.font = .preferredFont(forTextStyle: .body)
        summary.adjustsFontForContentSizeCategory = true
        summary.numberOfLines = 0
        let stack = UIStackView(arrangedSubviews: [summary, decision, fieldLabel, qualityField, reasonView])
        stack.axis = .vertical
        stack.spacing = 14
        stack.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.leadingAnchor.constraint(equalTo: view.layoutMarginsGuide.leadingAnchor),
            stack.trailingAnchor.constraint(equalTo: view.layoutMarginsGuide.trailingAnchor),
            stack.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 20),
        ])
        decisionChanged()
    }

    @objc private func decisionChanged() {
        let approve = decision.selectedSegmentIndex == 0
        fieldLabel.text = approve ? "Chất lượng %" : "Lý do từ chối"
        qualityField.isHidden = !approve
        reasonView.isHidden = approve
    }

    @objc private func submit() {
        if decision.selectedSegmentIndex == 0 {
            let value = Int(qualityField.text ?? "") ?? -1
            guard (0...100).contains(value) else {
                showError("Phần trăm chất lượng phải từ 0 đến 100.")
                return
            }
            onSubmit(true, value, nil)
        } else {
            let reason = reasonView.text.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !reason.isEmpty else {
                showError("Cần nhập lý do từ chối.")
                return
            }
            let alert = UIAlertController(title: "Từ chối hoàn thành?", message: "Lý do sẽ được gửi cho người thực hiện.", preferredStyle: .alert)
            alert.addAction(UIAlertAction(title: "Huỷ", style: .cancel))
            alert.addAction(UIAlertAction(title: "Từ chối", style: .destructive) { [weak self] _ in self?.onSubmit(false, nil, reason) })
            present(alert, animated: !UIAccessibility.isReduceMotionEnabled)
        }
    }

    private func showError(_ message: String) {
        let alert = UIAlertController(title: "Thông tin chưa hợp lệ", message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "Đóng", style: .default))
        present(alert, animated: !UIAccessibility.isReduceMotionEnabled)
    }
}
