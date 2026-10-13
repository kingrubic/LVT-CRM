import UIKit

@MainActor final class HomeroomDetailViewController: UITableViewController, UISearchBarDelegate {
    private let repository: HomeroomRepository
    private let store: HomeroomDetailStore
    private lazy var dayNavigator = HomeroomDayNavigator(date: store.context.date)
    private let pane = UISegmentedControl(items: ["Điểm danh", "Danh sách lớp"])
    private var dailyPane: Bool { pane.selectedSegmentIndex == 0 }
    private let search = UISearchBar()
    private let historyFrom = UIDatePicker()
    private let historyTo = UIDatePicker()
    private var task: Task<Void, Never>?
    private enum Row {
        case info(String, String?)
        case banner(String, String?, HomeroomTone, String)
        case stats([HomeroomStat])
        case item(title: String, subtitle: String?, chips: [HomeroomChip], leading: String?, studentId: String?)
    }
    private var rows: [Row] = []
    private lazy var writes = repository.writeOperations
    var onClassDateChanged: ((String) -> Void)?

    init(repository: HomeroomRepository, context: DetailContext, studentId: String? = nil) {
        self.repository = repository
        store = HomeroomDetailStore(operations: repository.detailOperations, context: context)
        store.studentId = studentId
        super.init(style: .insetGrouped)
        title = studentId == nil ? "Lớp" : "Học sinh"
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }
    deinit { task?.cancel() }

    override func viewDidLoad() {
        super.viewDidLoad()
        tableView.rowHeight = UITableView.automaticDimension
        tableView.estimatedRowHeight = 100
        refreshControl = UIRefreshControl()
        refreshControl?.addTarget(self, action: #selector(retry), for: .valueChanged)
        navigationItem.rightBarButtonItems = [UIBarButtonItem(title: "Tải lại", style: .plain, target: self, action: #selector(retry)), UIBarButtonItem(title: "Sửa", style: .plain, target: self, action: #selector(edit))]
        tableView.register(HomeroomStatTilesCell.self, forCellReuseIdentifier: HomeroomStatTilesCell.reuseIdentifier)
        tableView.register(HomeroomListCell.self, forCellReuseIdentifier: HomeroomListCell.reuseIdentifier)
        tableView.register(HomeroomBannerCell.self, forCellReuseIdentifier: HomeroomBannerCell.reuseIdentifier)
        dayNavigator.presenter = self
        dayNavigator.onChange = { [weak self] selected in self?.dateChanged(to: selected) }
        pane.selectedSegmentIndex = 0
        pane.heightAnchor.constraint(greaterThanOrEqualToConstant: 44).isActive = true
        pane.addTarget(self, action: #selector(paneChanged), for: .valueChanged)
        search.placeholder = "Tìm học sinh"
        search.searchBarStyle = .minimal
        search.delegate = self
        dayNavigator.isHidden = store.studentId != nil
        pane.isHidden = store.studentId != nil
        search.isHidden = store.studentId != nil
        let fromLabel = UILabel()
        fromLabel.text = "Lịch sử từ ngày"
        let toLabel = UILabel()
        toLabel.text = "Đến ngày"
        for label in [fromLabel, toLabel] {
            label.font = .preferredFont(forTextStyle: .body)
            label.adjustsFontForContentSizeCategory = true
            label.numberOfLines = 0
            label.isHidden = store.studentId == nil
        }
        for datePicker in [historyFrom, historyTo] {
            datePicker.datePickerMode = .date
            datePicker.preferredDatePickerStyle = .compact
            datePicker.calendar = Calendar(identifier: .gregorian)
            datePicker.timeZone = VietnamDate.timeZone
            datePicker.locale = Locale(identifier: "vi_VN")
            datePicker.isHidden = store.studentId == nil
            datePicker.heightAnchor.constraint(greaterThanOrEqualToConstant: 44).isActive = true
            datePicker.addTarget(self, action: #selector(historyChanged), for: .valueChanged)
        }
        historyFrom.date = VietnamDate.date(from: store.context.from) ?? Date()
        historyTo.date = VietnamDate.date(from: store.context.to) ?? Date()
        historyFrom.maximumDate = historyTo.date
        historyTo.minimumDate = historyFrom.date
        historyFrom.accessibilityLabel = "Lịch sử từ ngày"
        historyTo.accessibilityLabel = "Lịch sử đến ngày"
        let controls: [UIView] = store.studentId == nil ? [dayNavigator, pane, search] : [fromLabel, historyFrom, toLabel, historyTo]
        let stack = UIStackView(arrangedSubviews: controls)
        stack.axis = .vertical
        stack.spacing = 12
        stack.isLayoutMarginsRelativeArrangement = true
        stack.directionalLayoutMargins = NSDirectionalEdgeInsets(top: 12, leading: 20, bottom: 12, trailing: 20)
        tableView.tableHeaderView = stack
        store.onChange = { [weak self] in self?.render() }
    }

    override func viewWillAppear(_ animated: Bool) {
        super.viewWillAppear(animated)
        retry()
    }

    override func viewWillDisappear(_ animated: Bool) {
        super.viewWillDisappear(animated)
        task?.cancel()
        store.clear()
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        guard let header = tableView.tableHeaderView else { return }
        let size = header.systemLayoutSizeFitting(CGSize(width: tableView.bounds.width, height: 0), withHorizontalFittingPriority: .required, verticalFittingPriority: .fittingSizeLevel)
        if header.frame.size != size { header.frame.size = size; tableView.tableHeaderView = header }
    }

    @objc private func retry() {
        task?.cancel()
        store.clear()
        task = Task { [weak self] in await self?.store.load() }
    }
    private func dateChanged(to date: String) {
        guard date != store.context.date else { return }
        let current = store.context
        store.context = DetailContext(yearId: current.yearId, classId: current.classId, date: date, from: current.from, to: current.to)
        onClassDateChanged?(date)
        retry()
    }
    @objc private func paneChanged() { render() }
    @objc private func historyChanged() {
        let current = store.context
        let from = VietnamDate.string(from: historyFrom.date)
        let to = VietnamDate.string(from: historyTo.date)
        guard from <= to else { return }
        historyFrom.maximumDate = historyTo.date
        historyTo.minimumDate = historyFrom.date
        store.context = DetailContext(yearId: current.yearId, classId: current.classId, date: current.date, from: from, to: to)
        retry()
    }
    func searchBar(_ searchBar: UISearchBar, textDidChange searchText: String) { render() }

    private func matches(_ name: String, _ code: String) -> Bool {
        HomeroomDetailDecoder.matchesStudent(name: name, code: code, search: search.text ?? "")
    }

    private func render() {
        rows = []
        if store.loading {
            rows = [.info("Đang tải…", HomeroomPresentation.dayTitle(store.context.date))]
        } else if let error = store.error {
            rows = [.banner("Chưa tải được dữ liệu", "\(error)\nKéo xuống hoặc nhấn Tải lại để thử lại.", .danger, "exclamationmark.triangle")]
        } else if let data = store.classData {
            let klass = data.scoped.class
            title = klass.name.isEmpty ? klass.code : klass.name
            let teacher = data.scoped.currentTeacherName.isEmpty ? "chưa phân công" : data.scoped.currentTeacherName
            rows.append(.info(klass.name.isEmpty ? "Lớp \(klass.code)" : klass.name, ([HomeroomPresentation.dayTitle(store.context.date), "GVCN \(teacher)"] + (klass.status == "archived" ? ["Lớp đã lưu trữ"] : [])).joined(separator: " · ")))
            if dailyPane {
                let daily = data.daily
                let showStatus = daily.published && daily.schoolDay.isSchoolDay && !daily.schoolDay.outsideYear
                if daily.schoolDay.outsideYear { rows.append(.banner("Ngoài năm học", "Không cần điểm danh.", .info, "calendar.badge.exclamationmark")) }
                else if !daily.schoolDay.isSchoolDay { rows.append(.banner("Không phải ngày học", daily.schoolDay.note ?? "Không cần điểm danh.", .info, "calendar.badge.minus")) }
                else if !daily.published { rows.append(.banner("Chưa có dữ liệu điểm danh", "Dữ liệu sẽ hiện sau khi nhập từ camera.", .neutral, "hourglass")) }
                else { rows.append(.stats(HomeroomPresentation.dailyStats(daily.rows.map { $0.day?.effectiveStatus ?? "no_data" }))) }
                let visible = daily.rows.filter { matches($0.student.fullName, $0.student.studentCode) }
                if visible.isEmpty { rows.append(.info((search.text ?? "").isEmpty ? "Lớp chưa có học sinh" : "Không tìm thấy học sinh", nil)) }
                rows += visible.map { row in
                    let record = row.day
                    let chip = showStatus ? [HomeroomPresentation.studentChip(status: record?.effectiveStatus ?? "no_data", observedTime: record?.rawObservedAt.map(HomeroomPresentation.clock))] : []
                    return .item(title: row.student.fullName, subtitle: record?.note, chips: chip, leading: row.enrollment.rosterNumber.map(String.init) ?? "—", studentId: row.student._id)
                }
            } else {
                let visible = data.roster.rows.filter { matches($0.student.fullName, $0.student.studentCode) }
                rows.append(.info("\(visible.count) học sinh", nil))
                if visible.isEmpty { rows.append(.info(data.roster.rows.isEmpty ? "Lớp chưa có học sinh" : "Không tìm thấy học sinh", nil)) }
                rows += visible.map { .item(title: $0.student.fullName, subtitle: "Mã \($0.student.studentCode)", chips: [], leading: $0.enrollment.rosterNumber.map(String.init) ?? "—", studentId: $0.student._id) }
            }
        } else if let data = store.studentData {
            let student = data.profile.student
            title = "Học sinh"
            rows.append(.info(student.fullName, "Mã \(student.studentCode) · Ngày sinh \(student.dateOfBirth.map(VietnamDate.display) ?? "—") · Giới tính \(student.gender ?? "—")"))
            if data.profile.showContacts {
                rows.append(.item(title: "Điện thoại học sinh", subtitle: data.profile.studentPhone ?? "—", chips: [], leading: nil, studentId: nil))
                rows += data.profile.guardians.map { .item(title: "\($0.fullName) · \(HomeroomWriteFormViewController.label($0.relationship))", subtitle: $0.phone ?? "—", chips: $0.isPrimaryContact ? [HomeroomChip(text: "Liên hệ chính", tone: .info)] : [], leading: nil, studentId: nil) }
                if data.profile.permissions.canEditContacts { rows.append(.info("Liên hệ · \(data.profile.guardians.count)/6", "Nhấn Sửa để sửa số điện thoại hoặc người giám hộ.")) }
            } else { rows.append(.info("Thông tin liên hệ", "Bạn không có quyền xem thông tin liên hệ.")) }
            rows.append(.info("Quá trình học", nil))
            rows += data.profile.enrollments.map { .item(title: $0.className.isEmpty ? $0.classCode : $0.className, subtitle: "\(VietnamDate.display($0.startDate)) → \($0.endDate.map(VietnamDate.display) ?? "nay")", chips: $0.current ? [HomeroomChip(text: "Hiện tại", tone: .success)] : [], leading: nil, studentId: nil) }
            let history = data.history
            rows.append(.info("Lịch sử điểm danh", "\(VietnamDate.display(store.context.from)) → \(VietnamDate.display(store.context.to)) · \(history.days.count) buổi · \(history.corrections.count) lần điều chỉnh"))
            if history.days.isEmpty { rows.append(.info("Chưa có buổi điểm danh nào trong khoảng này", nil)) }
            rows += history.days.reversed().map { day in
                let time = day.rawObservedAt.map(HomeroomPresentation.clock)
                let detail = [time, day.note].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · ")
                return .item(title: HomeroomPresentation.dayTitle(day.attendanceDate), subtitle: detail.isEmpty ? nil : detail, chips: [HomeroomPresentation.studentChip(status: day.effectiveStatus, observedTime: time)], leading: nil, studentId: nil)
            }
            rows += history.corrections.sorted { $0.at > $1.at }.map { .item(title: "Điều chỉnh \(VietnamDate.display($0.attendanceDate))", subtitle: "\(HomeroomDetailDecoder.statusText($0.previousEffectiveStatus)) → \(HomeroomDetailDecoder.statusText($0.nextEffectiveStatus)) · \(timestamp($0.at))", chips: [], leading: nil, studentId: nil) }
        }
        if !store.loading { refreshControl?.endRefreshing() }
        tableView.reloadData()
        navigationItem.rightBarButtonItems?.last?.isEnabled = store.studentData.map { $0.profile.showContacts && $0.profile.permissions.canEditContacts } ?? (dailyPane && store.classData?.daily.canCorrect == true && store.classData?.daily.archived == false)
    }

    @objc private func edit() {
        let context = store.context
        if let data = store.studentData, data.profile.showContacts, data.profile.permissions.canEditContacts {
            let chooser = UIAlertController(title: "Liên hệ · \(data.profile.guardians.count)/6", message: "Liên hệ chính do máy chủ quyết định.", preferredStyle: .actionSheet)
            chooser.addAction(UIAlertAction(title: "Sửa điện thoại học sinh", style: .default) { [weak self] _ in self?.showContact(context, profile: data.profile, guardian: nil, mode: "phone") })
            if data.profile.guardians.count < 6 { chooser.addAction(UIAlertAction(title: "Thêm người giám hộ", style: .default) { [weak self] _ in self?.showContact(context, profile: data.profile, guardian: nil, mode: "guardian") }) }
            for guardian in data.profile.guardians { chooser.addAction(UIAlertAction(title: "Sửa hoặc xóa · \(guardian.fullName)", style: .default) { [weak self] _ in self?.showContact(context, profile: data.profile, guardian: guardian, mode: "guardian") }) }
            chooser.addAction(UIAlertAction(title: "Hủy", style: .cancel)); chooser.popoverPresentationController?.barButtonItem = navigationItem.rightBarButtonItems?.last; present(chooser, animated: true)
        } else if let data = store.classData, dailyPane, data.daily.canCorrect, !data.daily.archived {
            let rows = data.daily.rows.filter { $0.day?.rawObservation == "absent" }
            let targets = rows.compactMap { row in row.day.map { AbsenceTarget(id: $0._id, studentId: row.student._id, context: context) } }
            let selector = HomeroomAbsenceSelectionViewController(targets: targets, labels: rows.map { "\($0.student.fullName) · \($0.student.studentCode)" })
            selector.onSelect = { [weak self, weak selector] chosen, batch in
                guard let self, let selector else { return }
                let form = HomeroomWriteFormViewController(repository: writes, context: context, targets: chosen, batch: batch, isCurrent: { [weak self] in self?.store.context == context && self?.store.studentId == nil && self?.store.error == nil }, onClear: { [weak self] in self?.store.clear() }, onRefresh: { [weak self] in await self?.store.load() })
                selector.navigationController?.pushViewController(form, animated: true)
            }
            present(UINavigationController(rootViewController: selector), animated: true)
        }
    }
    private func showContact(_ context: DetailContext, profile: StudentProfile, guardian: StudentProfile.Guardian?, mode: String) {
        let id = profile.student._id
        let form = HomeroomWriteFormViewController(repository: writes, context: context, studentId: id, guardian: guardian, mode: mode, initialPhone: profile.studentPhone ?? "", isCurrent: { [weak self] in self?.store.context == context && self?.store.studentId == id && self?.store.error == nil }, onClear: { [weak self] in self?.store.clear() }, onRefresh: { [weak self] in await self?.store.load() })
        present(UINavigationController(rootViewController: form), animated: true)
    }

    private func timestamp(_ milliseconds: Double) -> String {
        let formatter = DateFormatter()
        formatter.timeZone = VietnamDate.timeZone
        formatter.locale = Locale(identifier: "vi_VN")
        formatter.dateFormat = "dd/MM/yyyy HH:mm"
        return formatter.string(from: Date(timeIntervalSince1970: milliseconds / 1000))
    }

    override func tableView(_ tableView: UITableView, numberOfRowsInSection section: Int) -> Int { rows.count }
    override func tableView(_ tableView: UITableView, cellForRowAt indexPath: IndexPath) -> UITableViewCell {
        switch rows[indexPath.row] {
        case let .info(title, detail):
            let cell = tableView.dequeueReusableCell(withIdentifier: "detail") ?? UITableViewCell(style: .subtitle, reuseIdentifier: "detail")
            var content = cell.defaultContentConfiguration()
            content.text = title
            content.secondaryText = detail
            content.textProperties.font = .preferredFont(forTextStyle: .headline)
            content.secondaryTextProperties.font = .preferredFont(forTextStyle: .subheadline)
            content.secondaryTextProperties.color = .secondaryLabel
            content.textProperties.numberOfLines = 0
            content.secondaryTextProperties.numberOfLines = 0
            cell.contentConfiguration = content
            cell.accessoryType = .none
            cell.selectionStyle = .none
            return cell
        case let .banner(title, message, tone, symbol):
            let cell = tableView.dequeueReusableCell(withIdentifier: HomeroomBannerCell.reuseIdentifier, for: indexPath) as! HomeroomBannerCell
            cell.configure(title: title, message: message, tone: tone, symbol: symbol)
            return cell
        case let .stats(stats):
            let cell = tableView.dequeueReusableCell(withIdentifier: HomeroomStatTilesCell.reuseIdentifier, for: indexPath) as! HomeroomStatTilesCell
            cell.configure(stats, footnote: nil)
            return cell
        case let .item(title, subtitle, chips, leading, studentId):
            let cell = tableView.dequeueReusableCell(withIdentifier: HomeroomListCell.reuseIdentifier, for: indexPath) as! HomeroomListCell
            cell.configure(title: title, subtitle: subtitle, chips: chips, leading: leading, tappable: studentId != nil)
            return cell
        }
    }
    override func tableView(_ tableView: UITableView, didSelectRowAt indexPath: IndexPath) {
        tableView.deselectRow(at: indexPath, animated: true)
        guard case let .item(_, _, _, _, studentId?) = rows[indexPath.row] else { return }
        navigationController?.pushViewController(HomeroomDetailViewController(repository: repository, context: store.context, studentId: studentId), animated: true)
    }
}
