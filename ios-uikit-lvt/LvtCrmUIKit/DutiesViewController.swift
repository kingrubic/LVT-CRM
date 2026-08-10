import UIKit

@MainActor
final class DutiesViewController: UITableViewController {
    private enum SectionKind {
        case feedback(String)
        case loading
        case error(String)
        case empty
        case duties([DutyItem])
    }

    private let viewModel: DutiesViewModel
    private var pendingFocusId: String?
    private weak var detailViewController: DutyDetailViewController?

    init(viewModel: DutiesViewModel) {
        self.viewModel = viewModel
        super.init(style: .insetGrouped)
        title = "Công tác"
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    override func viewDidLoad() {
        super.viewDidLoad()
        tableView.backgroundColor = .systemGroupedBackground
        tableView.cellLayoutMarginsFollowReadableWidth = true
        tableView.register(DutyTableViewCell.self, forCellReuseIdentifier: DutyTableViewCell.reuseIdentifier)
        tableView.register(UITableViewCell.self, forCellReuseIdentifier: "StateCell")
        tableView.estimatedRowHeight = 120
        tableView.rowHeight = UITableView.automaticDimension

        refreshControl = UIRefreshControl()
        refreshControl?.accessibilityLabel = "Tải lại danh sách công tác"
        refreshControl?.addTarget(self, action: #selector(refresh), for: .valueChanged)

        viewModel.onChange = { [weak self] in self?.render() }
        render()
        viewModel.refresh(initial: true)
    }

    override func numberOfSections(in tableView: UITableView) -> Int {
        sectionKinds.count
    }

    override func tableView(_ tableView: UITableView, numberOfRowsInSection section: Int) -> Int {
        switch sectionKinds[section] {
        case .duties(let duties): return duties.count
        default: return 1
        }
    }

    override func tableView(_ tableView: UITableView, titleForHeaderInSection section: Int) -> String? {
        guard case .duties = sectionKinds[section] else { return nil }
        return "Lịch công tác của bạn"
    }

    override func tableView(
        _ tableView: UITableView,
        cellForRowAt indexPath: IndexPath
    ) -> UITableViewCell {
        switch sectionKinds[indexPath.section] {
        case .duties(let duties):
            let duty = duties[indexPath.row]
            let cell = tableView.dequeueReusableCell(
                withIdentifier: DutyTableViewCell.reuseIdentifier,
                for: indexPath
            ) as! DutyTableViewCell
            cell.configure(
                duty: duty,
                canMark: viewModel.canMark(duty),
                busy: viewModel.busyDutyId == duty.id,
                focused: duty.id == pendingFocusId
            )
            cell.accessibilityCustomActions = attendanceAccessibilityActions(for: duty)
            return cell
        case .feedback(let message):
            return stateCell(
                at: indexPath,
                title: "Không thể cập nhật công tác",
                detail: message,
                image: "exclamationmark.circle.fill",
                color: .systemRed
            )
        case .loading:
            let cell = stateCell(
                at: indexPath,
                title: "Đang tải công tác…",
                detail: nil,
                image: nil,
                color: .secondaryLabel
            )
            let indicator = UIActivityIndicatorView(style: .medium)
            indicator.startAnimating()
            indicator.accessibilityLabel = "Đang tải"
            cell.accessoryView = indicator
            cell.accessibilityLabel = "Đang tải danh sách công tác"
            return cell
        case .error(let message):
            let cell = stateCell(
                at: indexPath,
                title: "Không thể tải công tác",
                detail: message,
                image: "exclamationmark.triangle.fill",
                color: .systemRed
            )
            cell.accessoryType = .disclosureIndicator
            cell.selectionStyle = .default
            cell.accessibilityLabel = "Không thể tải công tác. \(message). Thử lại"
            cell.accessibilityHint = "Tải lại danh sách công tác"
            cell.accessibilityTraits = .button
            return cell
        case .empty:
            let title = viewModel.duties.isEmpty ? "Chưa có công tác" : "Không có công tác phù hợp"
            let detail = viewModel.duties.isEmpty
                ? "Khi được phân công, công tác sẽ xuất hiện tại đây."
                : "Hãy chọn một bộ lọc khác."
            let cell = stateCell(
                at: indexPath,
                title: title,
                detail: detail,
                image: viewModel.duties.isEmpty ? "briefcase" : "line.3.horizontal.decrease.circle",
                color: .secondaryLabel
            )
            cell.accessibilityLabel = "\(title). \(detail)"
            cell.accessibilityTraits = .staticText
            return cell
        }
    }

    override func tableView(_ tableView: UITableView, didSelectRowAt indexPath: IndexPath) {
        tableView.deselectRow(at: indexPath, animated: true)
        switch sectionKinds[indexPath.section] {
        case .error:
            viewModel.refresh(initial: true)
        case .duties(let duties):
            showDetail(for: duties[indexPath.row])
        default:
            break
        }
    }

    override func tableView(
        _ tableView: UITableView,
        trailingSwipeActionsConfigurationForRowAt indexPath: IndexPath
    ) -> UISwipeActionsConfiguration? {
        guard case .duties(let duties) = sectionKinds[indexPath.section] else { return nil }
        let duty = duties[indexPath.row]
        guard viewModel.canMark(duty), viewModel.busyDutyId == nil else { return nil }
        let absent = UIContextualAction(style: .destructive, title: "Vắng") { [weak self] _, _, done in
            self?.viewModel.setAttendance(dutyId: duty.id, status: "absent")
            done(true)
        }
        absent.image = UIImage(systemName: "xmark.circle")
        let attended = UIContextualAction(style: .normal, title: "Có mặt") { [weak self] _, _, done in
            self?.viewModel.setAttendance(dutyId: duty.id, status: "attended")
            done(true)
        }
        attended.backgroundColor = .systemTeal
        attended.image = UIImage(systemName: "checkmark.circle")
        let configuration = UISwipeActionsConfiguration(actions: [absent, attended])
        configuration.performsFirstActionWithFullSwipe = false
        return configuration
    }

    func focus(dutyId: String) {
        loadViewIfNeeded()
        pendingFocusId = dutyId
        if viewModel.filter != .all {
            viewModel.filter = .all
        } else {
            render()
        }
    }

    private var sectionKinds: [SectionKind] {
        var sections: [SectionKind] = []
        if let actionError = viewModel.actionError {
            sections.append(.feedback(actionError))
        }
        if let error = viewModel.error {
            sections.append(.error(error))
        } else if viewModel.loading {
            sections.append(.loading)
        } else if viewModel.visibleDuties.isEmpty {
            sections.append(.empty)
        } else {
            sections.append(.duties(viewModel.visibleDuties))
        }
        return sections
    }

    private func render() {
        navigationItem.rightBarButtonItem = UIBarButtonItem(
            title: "Lọc: \(viewModel.filter.title)",
            image: UIImage(systemName: "line.3.horizontal.decrease.circle"),
            primaryAction: nil,
            menu: filterMenu()
        )
        navigationItem.rightBarButtonItem?.accessibilityLabel = "Lọc công tác. \(viewModel.filter.title)"
        if !viewModel.refreshing { refreshControl?.endRefreshing() }
        tableView.reloadData()
        updateVisibleDetail()
        processPendingFocusIfPossible()
    }

    private func filterMenu() -> UIMenu {
        UIMenu(children: DutyFilter.allCases.map { filter in
            UIAction(
                title: filter.title,
                state: viewModel.filter == filter ? .on : .off
            ) { [weak self] _ in
                self?.pendingFocusId = nil
                self?.viewModel.filter = filter
            }
        })
    }

    private func processPendingFocusIfPossible() {
        guard let dutyId = pendingFocusId, !viewModel.loading, viewModel.error == nil else { return }
        pendingFocusId = nil
        guard let duty = viewModel.duty(id: dutyId),
              let section = sectionKinds.firstIndex(where: {
                  if case .duties = $0 { return true }
                  return false
              }),
              let row = viewModel.visibleDuties.firstIndex(where: { $0.id == dutyId }) else {
            presentMissingDutyAlert()
            return
        }
        let indexPath = IndexPath(row: row, section: section)
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            self.tableView.scrollToRow(at: indexPath, at: .middle, animated: !UIAccessibility.isReduceMotionEnabled)
            self.tableView.selectRow(at: indexPath, animated: true, scrollPosition: .none)
            UIAccessibility.post(notification: .screenChanged, argument: self.tableView.cellForRow(at: indexPath))
            self.showDetail(for: duty)
        }
    }

    private func showDetail(for duty: DutyItem) {
        let detail = DutyDetailViewController(
            duty: duty,
            attendanceEnabled: viewModel.attendanceConfirmationEnabled,
            busy: viewModel.busyDutyId == duty.id,
            actionError: viewModel.actionError,
            onSetAttendance: { [weak self] status in
                self?.viewModel.setAttendance(dutyId: duty.id, status: status)
            }
        )
        detailViewController = detail
        navigationController?.pushViewController(detail, animated: !UIAccessibility.isReduceMotionEnabled)
    }

    private func updateVisibleDetail() {
        guard let detail = detailViewController, let duty = viewModel.duty(id: detail.dutyId) else { return }
        detail.update(
            duty: duty,
            attendanceEnabled: viewModel.attendanceConfirmationEnabled,
            busy: viewModel.busyDutyId == duty.id,
            actionError: viewModel.actionError
        )
    }

    private func presentMissingDutyAlert() {
        let alert = UIAlertController(
            title: "Không tìm thấy công tác",
            message: "Công tác này không còn tồn tại hoặc bạn không có quyền xem.",
            preferredStyle: .alert
        )
        alert.addAction(UIAlertAction(title: "Đóng", style: .default))
        present(alert, animated: !UIAccessibility.isReduceMotionEnabled)
    }

    private func attendanceAccessibilityActions(for duty: DutyItem) -> [UIAccessibilityCustomAction]? {
        guard viewModel.canMark(duty), viewModel.busyDutyId == nil else { return nil }
        return [
            UIAccessibilityCustomAction(name: "Đánh dấu có mặt") { [weak self] _ in
                self?.viewModel.setAttendance(dutyId: duty.id, status: "attended")
                return true
            },
            UIAccessibilityCustomAction(name: "Đánh dấu vắng") { [weak self] _ in
                self?.viewModel.setAttendance(dutyId: duty.id, status: "absent")
                return true
            },
        ]
    }

    private func stateCell(
        at indexPath: IndexPath,
        title: String,
        detail: String?,
        image: String?,
        color: UIColor
    ) -> UITableViewCell {
        let cell = tableView.dequeueReusableCell(withIdentifier: "StateCell", for: indexPath)
        cell.accessoryType = .none
        cell.accessoryView = nil
        cell.selectionStyle = .none
        cell.accessibilityHint = nil
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
        return cell
    }

    @objc private func refresh() {
        viewModel.refresh()
    }
}

private final class DutyTableViewCell: UITableViewCell {
    static let reuseIdentifier = "DutyCell"

    private let timingLabel = UILabel()
    private let statusLabel = UILabel()
    private let titleLabel = UILabel()
    private let scheduleLabel = UILabel()
    private let activityIndicator = UIActivityIndicatorView(style: .medium)

    override init(style: UITableViewCell.CellStyle, reuseIdentifier: String?) {
        super.init(style: style, reuseIdentifier: reuseIdentifier)
        accessoryType = .disclosureIndicator
        selectionStyle = .default

        [timingLabel, statusLabel].forEach {
            $0.font = .preferredFont(forTextStyle: .caption1)
            $0.adjustsFontForContentSizeCategory = true
            $0.numberOfLines = 0
        }
        titleLabel.font = .preferredFont(forTextStyle: .headline)
        titleLabel.adjustsFontForContentSizeCategory = true
        titleLabel.numberOfLines = 0
        scheduleLabel.font = .preferredFont(forTextStyle: .subheadline)
        scheduleLabel.adjustsFontForContentSizeCategory = true
        scheduleLabel.textColor = .secondaryLabel
        scheduleLabel.numberOfLines = 0

        let statusStack = UIStackView(arrangedSubviews: [timingLabel, statusLabel])
        statusStack.axis = .horizontal
        statusStack.alignment = .firstBaseline
        statusStack.distribution = .equalSpacing
        statusStack.spacing = 12

        let stack = UIStackView(arrangedSubviews: [statusStack, titleLabel, scheduleLabel])
        stack.axis = .vertical
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

    func configure(duty: DutyItem, canMark: Bool, busy: Bool, focused: Bool) {
        titleLabel.text = duty.content
        scheduleLabel.text = DutyPresentation.schedule(duty)
        timingLabel.text = DutyPresentation.timing(duty)
        timingLabel.textColor = DutyPresentation.timingColor(duty)
        statusLabel.text = DutyPresentation.status(duty.myStatus)
        statusLabel.textColor = DutyPresentation.statusColor(duty.myStatus)
        backgroundColor = focused ? UIColor.systemIndigo.withAlphaComponent(0.12) : .secondarySystemGroupedBackground
        accessoryView = busy ? activityIndicator : nil
        accessoryType = busy ? .none : .disclosureIndicator
        if busy { activityIndicator.startAnimating() } else { activityIndicator.stopAnimating() }
        isUserInteractionEnabled = !busy
        isAccessibilityElement = true
        accessibilityTraits = .button
        accessibilityLabel = [
            DutyPresentation.timing(duty),
            DutyPresentation.status(duty.myStatus),
            duty.content,
            DutyPresentation.schedule(duty),
        ].joined(separator: ". ")
        accessibilityHint = canMark
            ? "Mở chi tiết. Có các thao tác xác nhận tham dự."
            : "Mở chi tiết công tác."
    }
}

@MainActor
private final class DutyDetailViewController: UITableViewController {
    private enum Section {
        case error(String)
        case content
        case information([(String, String)])
        case attendance
    }

    private(set) var dutyId: String
    private var duty: DutyItem
    private var attendanceEnabled: Bool
    private var busy: Bool
    private var actionError: String?
    private let onSetAttendance: (String) -> Void

    init(
        duty: DutyItem,
        attendanceEnabled: Bool,
        busy: Bool,
        actionError: String?,
        onSetAttendance: @escaping (String) -> Void
    ) {
        dutyId = duty.id
        self.duty = duty
        self.attendanceEnabled = attendanceEnabled
        self.busy = busy
        self.actionError = actionError
        self.onSetAttendance = onSetAttendance
        super.init(style: .insetGrouped)
        title = "Chi tiết công tác"
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    override func viewDidLoad() {
        super.viewDidLoad()
        navigationItem.largeTitleDisplayMode = .never
        tableView.backgroundColor = .systemGroupedBackground
        tableView.cellLayoutMarginsFollowReadableWidth = true
        tableView.register(UITableViewCell.self, forCellReuseIdentifier: "DetailCell")
        tableView.estimatedRowHeight = 80
        tableView.rowHeight = UITableView.automaticDimension
    }

    override func numberOfSections(in tableView: UITableView) -> Int {
        sections.count
    }

    override func tableView(_ tableView: UITableView, numberOfRowsInSection section: Int) -> Int {
        switch sections[section] {
        case .information(let rows): return rows.count
        case .attendance: return 2
        default: return 1
        }
    }

    override func tableView(_ tableView: UITableView, titleForHeaderInSection section: Int) -> String? {
        switch sections[section] {
        case .information: return "Thông tin"
        case .attendance: return "Xác nhận tham dự"
        default: return nil
        }
    }

    override func tableView(
        _ tableView: UITableView,
        cellForRowAt indexPath: IndexPath
    ) -> UITableViewCell {
        let cell = tableView.dequeueReusableCell(withIdentifier: "DetailCell", for: indexPath)
        cell.accessoryType = .none
        cell.accessoryView = nil
        cell.selectionStyle = .none
        cell.isUserInteractionEnabled = true
        cell.accessibilityHint = nil
        cell.accessibilityTraits = .staticText
        var content = cell.defaultContentConfiguration()
        content.textProperties.numberOfLines = 0
        content.secondaryTextProperties.numberOfLines = 0
        switch sections[indexPath.section] {
        case .error(let message):
            content.text = "Không thể cập nhật công tác"
            content.secondaryText = message
            content.image = UIImage(systemName: "exclamationmark.circle.fill")
            content.imageProperties.tintColor = .systemRed
            content.textProperties.color = .systemRed
            cell.accessibilityLabel = "Không thể cập nhật công tác. \(message)"
        case .content:
            content.text = duty.content
            content.textProperties.font = .preferredFont(forTextStyle: .title3)
            content.textProperties.color = .label
            cell.accessibilityLabel = duty.content
        case .information(let rows):
            let row = rows[indexPath.row]
            content.text = row.0
            content.secondaryText = row.1
            cell.accessibilityLabel = "\(row.0). \(row.1)"
        case .attendance:
            let attended = indexPath.row == 0
            content.text = attended ? "Có mặt" : "Vắng"
            content.image = UIImage(systemName: attended ? "checkmark.circle.fill" : "xmark.circle.fill")
            content.imageProperties.tintColor = attended ? .systemTeal : .systemRed
            cell.selectionStyle = busy ? .none : .default
            cell.isUserInteractionEnabled = !busy
            cell.accessibilityTraits = busy ? .notEnabled : .button
            cell.accessibilityLabel = attended ? "Xác nhận có mặt" : "Xác nhận vắng"
            if busy {
                let indicator = UIActivityIndicatorView(style: .medium)
                indicator.startAnimating()
                cell.accessoryView = indicator
            }
        }
        cell.contentConfiguration = content
        return cell
    }

    override func tableView(_ tableView: UITableView, didSelectRowAt indexPath: IndexPath) {
        tableView.deselectRow(at: indexPath, animated: true)
        guard case .attendance = sections[indexPath.section], !busy else { return }
        onSetAttendance(indexPath.row == 0 ? "attended" : "absent")
    }

    func update(
        duty: DutyItem,
        attendanceEnabled: Bool,
        busy: Bool,
        actionError: String?
    ) {
        dutyId = duty.id
        self.duty = duty
        self.attendanceEnabled = attendanceEnabled
        self.busy = busy
        self.actionError = actionError
        tableView.reloadData()
        if !busy, actionError == nil {
            UIAccessibility.post(
                notification: .announcement,
                argument: "Trạng thái công tác: \(DutyPresentation.status(duty.myStatus))"
            )
        }
    }

    private var sections: [Section] {
        var result: [Section] = []
        if let actionError { result.append(.error(actionError)) }
        result.append(.content)
        result.append(.information(informationRows))
        if attendanceEnabled && duty.isMine && duty.canMarkAttendance {
            result.append(.attendance)
        }
        return result
    }

    private var informationRows: [(String, String)] {
        var rows: [(String, String)] = [
            ("Thời gian", DutyPresentation.schedule(duty)),
            ("Trạng thái", DutyPresentation.status(duty.myStatus)),
        ]
        if !duty.locationNames.isEmpty {
            rows.append(("Địa điểm", duty.locationNames.joined(separator: ", ")))
        }
        if !duty.departmentNames.isEmpty {
            rows.append(("Tổ/phòng", duty.departmentNames.joined(separator: ", ")))
        }
        rows.append(contentsOf: duty.departmentParticipants.compactMap { participants in
            guard !participants.participantNames.isEmpty else { return nil }
            return (participants.departmentName, participants.participantNames.joined(separator: ", "))
        })
        if !duty.participantNames.isEmpty {
            rows.append(("Thành phần", duty.participantNames.joined(separator: ", ")))
        }
        return rows
    }
}

private enum DutyPresentation {
    static func schedule(_ duty: DutyItem) -> String {
        let dates = duty.startDate == duty.endDate
            ? duty.startDate
            : "\(duty.startDate) → \(duty.endDate)"
        return duty.allDay ? "\(dates) · Cả ngày" : "\(dates) · \(duty.startTime)–\(duty.endTime)"
    }

    static func timing(_ duty: DutyItem) -> String {
        if duty.isOngoing { return "Đang diễn ra" }
        if duty.isOverdue { return "Đã kết thúc" }
        if duty.isUpcoming { return "Sắp tới" }
        return "Theo lịch"
    }

    static func timingColor(_ duty: DutyItem) -> UIColor {
        if duty.isOngoing { return .systemGreen }
        if duty.isUpcoming { return .systemIndigo }
        return .secondaryLabel
    }

    static func status(_ status: String) -> String {
        switch status {
        case "attended": return "Có mặt"
        case "absent": return "Vắng"
        default: return "Chưa xác nhận"
        }
    }

    static func statusColor(_ status: String) -> UIColor {
        switch status {
        case "attended": return .systemGreen
        case "absent": return .systemRed
        default: return .systemOrange
        }
    }
}
