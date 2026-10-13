import UIKit

@MainActor
final class HomeroomViewController: UITableViewController {
    private let repository: HomeroomRepository
    private let session: UserSession
    private let yearButton = UIButton(type: .system)
    private lazy var dayNavigator = HomeroomDayNavigator(date: date)
    private let pane = UISegmentedControl(items: ["Tổng quan", "Vắng chờ xử lý"])
    private var years: [SchoolYear] = []
    private var yearId: String?
    private var date = VietnamDate.today()
    private var overview: HomeroomOverview?
    private var pending: PendingAbsences?
    private var status: HomeroomImportStatus?
    private var loading = false
    private lazy var writes = repository.writeOperations
    private var errorMessage: String?
    private var loadTask: Task<Void, Never>?
    private var generation = 0
    private enum Row {
        case info(String, String)
        case banner(String, String?, HomeroomTone, String)
        case stats([HomeroomStat], String?)
        case item(title: String, subtitle: String?, chips: [HomeroomChip], classIndex: Int?)
    }
    private var rows: [Row] = []
    private var cameraStores: [String: CameraImportStore] = [:]
    private var managementStores: [String: HomeroomManagementStore] = [:]

    init(repository: HomeroomRepository, session: UserSession) {
        self.repository = repository
        self.session = session
        super.init(style: .insetGrouped)
        title = "Lớp chủ nhiệm"
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    deinit { loadTask?.cancel() }

    override func viewWillAppear(_ animated: Bool) {
        super.viewWillAppear(animated)
        load()
        navigationItem.rightBarButtonItems = [UIBarButtonItem(title: "Phân loại vắng", style: .plain, target: self, action: #selector(editPending))]
        if session.isOperationalManager || session.isHomeroomSupervisor {
            navigationItem.rightBarButtonItems?.append(UIBarButtonItem(title: "Nhập camera", style: .plain, target: self, action: #selector(importCamera)))
        }
        if session.isOperationalManager {
            navigationItem.rightBarButtonItems?.append(UIBarButtonItem(title: "Danh mục", style: .plain, target: self, action: #selector(manage)))
        }
    }
    @objc private func manage() {
        guard !loading, session.isOperationalManager, let yearId else { return }
        let requestedDate = date
        let key = "\(yearId)/\(requestedDate)"
        let store = managementStores[key] ?? repository.management(yearId: yearId, date: requestedDate) { [weak self] in self?.yearId == yearId && self?.date == requestedDate }
        managementStores[key] = store
        present(UINavigationController(rootViewController: HomeroomManagementViewController(store: store)), animated: true)
    }
    @objc private func importCamera() {
        guard !loading, let yearId, years.contains(where: { $0.id == yearId }), session.isOperationalManager || session.isHomeroomSupervisor else { return }
        let requestedDate = date
        let key = "\(yearId)/\(requestedDate)"
        let store = cameraStores[key] ?? repository.cameraImport(yearId: yearId, date: requestedDate) { [weak self] in self?.yearId == yearId && self?.date == requestedDate }
        cameraStores[key] = store
        present(UINavigationController(rootViewController: HomeroomCameraImportViewController(store: store)), animated: true)
    }
    @objc private func editPending() {
        guard !loading, !session.isHomeroomSupervisor, pane.selectedSegmentIndex == 1, let year = years.first(where: { $0.id == yearId }), let pending else { return }
        let available = pending.rows.filter { $0.canCorrect && !$0.classId.isEmpty && !$0.studentId.isEmpty }
        let targets = available.map { AbsenceTarget(id: $0.id, studentId: $0.studentId, context: DetailContext(yearId: year.id, classId: $0.classId, date: $0.attendanceDate, from: year.startDate, to: year.endDate)) }
        let selector = HomeroomAbsenceSelectionViewController(targets: targets, labels: available.map { "\($0.fullName) · \($0.classCode)" })
        let requestedDate = date
        selector.onSelect = { [weak self, weak selector] chosen, batch in
            guard let self, let selector, let context = chosen.first?.context else { return }
            let form = HomeroomWriteFormViewController(repository: writes, context: context, targets: chosen, batch: batch, isCurrent: { [weak self] in self?.yearId == year.id && self?.date == requestedDate && self?.pane.selectedSegmentIndex == 1 && self?.errorMessage == nil }, onClear: { [weak self] in self?.overview = nil; self?.pending = nil; self?.render() }, onRefresh: { [weak self] in self?.load() })
            selector.navigationController?.pushViewController(form, animated: true)
        }
        present(UINavigationController(rootViewController: selector), animated: true)
    }

    override func viewWillDisappear(_ animated: Bool) {
        super.viewWillDisappear(animated)
        loadTask?.cancel()
        generation += 1
        overview = nil
        pending = nil
        status = nil
        rows = []
        tableView.reloadData()
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        tableView.rowHeight = UITableView.automaticDimension
        tableView.estimatedRowHeight = 110
        tableView.allowsSelection = true
        refreshControl = UIRefreshControl()
        refreshControl?.addTarget(self, action: #selector(retry), for: .valueChanged)
        navigationItem.rightBarButtonItem = UIBarButtonItem(title: "Tải lại", style: .plain, target: self, action: #selector(retry))
        yearButton.showsMenuAsPrimaryAction = true
        yearButton.titleLabel?.font = .preferredFont(forTextStyle: .headline)
        yearButton.titleLabel?.adjustsFontForContentSizeCategory = true
        yearButton.titleLabel?.numberOfLines = 0
        yearButton.heightAnchor.constraint(greaterThanOrEqualToConstant: 44).isActive = true
        tableView.register(HomeroomStatTilesCell.self, forCellReuseIdentifier: HomeroomStatTilesCell.reuseIdentifier)
        tableView.register(HomeroomListCell.self, forCellReuseIdentifier: HomeroomListCell.reuseIdentifier)
        tableView.register(HomeroomBannerCell.self, forCellReuseIdentifier: HomeroomBannerCell.reuseIdentifier)
        dayNavigator.presenter = self
        dayNavigator.onChange = { [weak self] selected in self?.dateChanged(to: selected) }
        pane.selectedSegmentIndex = 0
        pane.isHidden = session.isHomeroomSupervisor
        pane.addTarget(self, action: #selector(paneChanged), for: .valueChanged)
        pane.heightAnchor.constraint(greaterThanOrEqualToConstant: 44).isActive = true
        let stack = UIStackView(arrangedSubviews: [yearButton, dayNavigator, pane])
        stack.axis = .vertical
        stack.spacing = 12
        stack.isLayoutMarginsRelativeArrangement = true
        stack.directionalLayoutMargins = NSDirectionalEdgeInsets(top: 12, leading: 20, bottom: 12, trailing: 20)
        tableView.tableHeaderView = stack
        updateHeader()
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        guard let header = tableView.tableHeaderView else { return }
        let size = header.systemLayoutSizeFitting(
            CGSize(width: tableView.bounds.width, height: 0),
            withHorizontalFittingPriority: .required, verticalFittingPriority: .fittingSizeLevel
        )
        if header.frame.size != size {
            header.frame.size = size
            tableView.tableHeaderView = header
        }
    }

    @objc private func retry() { load() }
    @objc private func paneChanged() { render() }
    private func dateChanged(to selected: String) {
        guard selected != date else { return }
        managementStores.values.forEach { $0.invalidate() }
        date = selected
        load()
    }

    private func updateHeader() {
        yearButton.setTitle(years.first { $0.id == yearId }.map { "Năm học \($0.name)" } ?? "Chọn năm học", for: .normal)
        yearButton.menu = UIMenu(children: years.map { year in
            UIAction(title: year.name, state: year.id == yearId ? .on : .off) { [weak self] _ in
                guard let self, self.yearId != year.id else { return }
                self.yearId = year.id
                self.managementStores.values.forEach { $0.invalidate() }
                self.updateHeader()
                self.load()
            }
        })
        pane.setTitle("Vắng chờ xử lý (\(pending?.total ?? 0))", forSegmentAt: 1)
        view.setNeedsLayout()
    }

    private func load() {
        guard session.canSeeHomeroom else {
            overview = nil
            pending = nil
            status = nil
            errorMessage = "Bạn không có quyền truy cập Lớp chủ nhiệm."
            render()
            return
        }
        loadTask?.cancel()
        generation += 1
        let version = generation
        let requestedDate = date
        let requestedYear = yearId
        loading = true
        errorMessage = nil
        overview = nil
        pending = nil
        status = nil
        render()
        loadTask = Task { [weak self] in
            guard let self else { return }
            do {
                let loadedYears = try await repository.listSchoolYears()
                guard !Task.isCancelled, generation == version else { return }
                years = loadedYears
                yearId = loadedYears.first { $0.id == requestedYear }?.id
                    ?? loadedYears.first { $0.active }?.id ?? loadedYears.first?.id
                updateHeader()
                if let selectedYear = yearId {
                    if session.isHomeroomSupervisor {
                        let result = try await repository.importStatus(schoolYearId: selectedYear, date: requestedDate)
                        guard !Task.isCancelled, generation == version else { return }
                        status = result
                    } else {
                        let result = try await repository.overview(schoolYearId: selectedYear, date: requestedDate)
                        let pendingResult = try await repository.pendingAbsences(schoolYearId: selectedYear)
                        guard !Task.isCancelled, generation == version else { return }
                        guard result.date == requestedDate, result.schoolYear.id == selectedYear else {
                            throw ConvexException(code: "INVALID_RESPONSE", message: "Phản hồi không khớp năm học/ngày đã chọn.")
                        }
                        overview = result
                        pending = pendingResult
                    }
                }
                loading = false
                updateHeader()
                refreshControl?.endRefreshing()
                render()
            } catch {
                guard !Task.isCancelled, generation == version else { return }
                loading = false
                errorMessage = error.localizedDescription
                refreshControl?.endRefreshing()
                render()
            }
        }
    }

    private func render() {
        rows = []
        if loading {
            rows = [.info("Đang tải lớp chủ nhiệm…", HomeroomPresentation.dayTitle(date))]
        } else if let errorMessage {
            rows = [.banner("Chưa tải được dữ liệu", "\(errorMessage)\nKéo xuống hoặc nhấn Tải lại để thử lại.", .danger, "exclamationmark.triangle")]
        } else if years.isEmpty {
            rows = [.banner("Chưa có năm học", "Quản trị viên cần tạo năm học trước khi điểm danh.", .neutral, "calendar")]
        } else if session.isHomeroomSupervisor, let status {
            rows.append(.banner("Tình trạng nhập điểm danh toàn trường", "Giám thị theo dõi việc nhập dữ liệu camera; danh sách lớp và học sinh chỉ dành cho GVCN và quản trị.", .info, "person.3"))
            rows.append(.stats([HomeroomStat(value: HomeroomPresentation.number(status.publishedClassCount), label: "Lớp đã có dữ liệu", tone: .success)], nil))
            if status.uploads.isEmpty { rows.append(.banner("Chưa có tệp nào cho ngày này", nil, .neutral, "tray")) }
            rows += status.uploads.map { .item(title: $0.fileName, subtitle: "\($0.matchedCount)/\($0.rowCount) dòng khớp · \($0.uploadedByName.isEmpty ? "Không rõ người nhập" : $0.uploadedByName)", chips: [], classIndex: nil) }
        } else if pane.selectedSegmentIndex == 1, let pending {
            rows.append(.info("Các buổi vắng chưa phân loại trong năm học", pending.truncated ? "Đang hiện \(pending.rows.count) buổi gần nhất trong \(pending.total) buổi." : "Nhấn Phân loại vắng để chọn buổi cần phân loại."))
            if pending.rows.isEmpty { rows.append(.banner("Không còn buổi vắng nào chờ xử lý", nil, .success, "checkmark.circle")) }
            rows += pending.rows.map { row in
                let subtitle = ["Lớp \(row.classCode)", HomeroomPresentation.dayTitle(row.attendanceDate), row.note].filter { !$0.isEmpty }.joined(separator: " · ")
                return .item(title: row.fullName, subtitle: subtitle, chips: [HomeroomChip(text: "Vắng", tone: .danger)], classIndex: nil)
            }
        } else if let overview {
            let schoolDay = overview.schoolDay.isSchoolDay && !overview.schoolDay.outsideYear
            if overview.schoolDay.outsideYear {
                rows.append(.banner("Ngoài năm học", "Ngày đã chọn nằm ngoài năm học \(overview.schoolYear.name).", .info, "calendar.badge.exclamationmark"))
            } else if !overview.schoolDay.isSchoolDay {
                rows.append(.banner(overview.date == overview.today ? "Hôm nay không phải ngày học" : "Không phải ngày học", overview.schoolDay.note.isEmpty ? "Không cần điểm danh." : overview.schoolDay.note, .info, "calendar.badge.minus"))
            } else {
                rows.append(.stats(HomeroomPresentation.overviewStats(overview.counts), HomeroomPresentation.overviewSummary(studentCount: overview.studentCount, classCount: overview.classes.count, attendanceRate: overview.attendanceRate, ratedRows: overview.ratedRows)))
            }
            if schoolDay, overview.missingUploadShouldAlert {
                rows.append(.banner("Còn \(overview.missingClassCodes.count) lớp chưa có dữ liệu", "Đã quá \(overview.missingUploadCutoffTime): \(overview.missingClassCodes.joined(separator: ", "))", .warning, "exclamationmark.triangle"))
            }
            if overview.classes.isEmpty {
                rows.append(.banner("Chưa có lớp", "Bạn chưa được phân công lớp chủ nhiệm trong ngày này.", .neutral, "person.3"))
            }
            rows += overview.classes.enumerated().map { index, klass in
                .item(title: HomeroomPresentation.classTitle(klass), subtitle: HomeroomPresentation.classSubtitle(klass), chips: HomeroomPresentation.classChips(klass, schoolDay: schoolDay), classIndex: index)
            }
        }
        tableView.reloadData()
        navigationItem.rightBarButtonItem?.isEnabled = !loading && errorMessage == nil && !session.isHomeroomSupervisor && pane.selectedSegmentIndex == 1 && pending?.rows.contains(where: { $0.canCorrect && !$0.classId.isEmpty && !$0.studentId.isEmpty }) == true
    }

    override func tableView(_ tableView: UITableView, numberOfRowsInSection section: Int) -> Int { rows.count }

    override func tableView(_ tableView: UITableView, cellForRowAt indexPath: IndexPath) -> UITableViewCell {
        switch rows[indexPath.row] {
        case let .info(title, detail):
            let cell = tableView.dequeueReusableCell(withIdentifier: "homeroom") ?? UITableViewCell(style: .subtitle, reuseIdentifier: "homeroom")
            var content = cell.defaultContentConfiguration()
            content.text = title
            content.secondaryText = detail
            content.textProperties.font = .preferredFont(forTextStyle: .headline)
            content.secondaryTextProperties.font = .preferredFont(forTextStyle: .subheadline)
            content.secondaryTextProperties.color = .secondaryLabel
            content.textProperties.numberOfLines = 0
            content.secondaryTextProperties.numberOfLines = 0
            cell.contentConfiguration = content
            cell.selectionStyle = .none
            cell.accessoryType = .none
            return cell
        case let .banner(title, message, tone, symbol):
            let cell = tableView.dequeueReusableCell(withIdentifier: HomeroomBannerCell.reuseIdentifier, for: indexPath) as! HomeroomBannerCell
            cell.configure(title: title, message: message, tone: tone, symbol: symbol)
            return cell
        case let .stats(stats, footnote):
            let cell = tableView.dequeueReusableCell(withIdentifier: HomeroomStatTilesCell.reuseIdentifier, for: indexPath) as! HomeroomStatTilesCell
            cell.configure(stats, footnote: footnote)
            return cell
        case let .item(title, subtitle, chips, classIndex):
            let cell = tableView.dequeueReusableCell(withIdentifier: HomeroomListCell.reuseIdentifier, for: indexPath) as! HomeroomListCell
            cell.configure(title: title, subtitle: subtitle, chips: chips, tappable: classIndex != nil)
            return cell
        }
    }

    private func classAt(_ row: Int) -> HomeroomClassSummary? {
        guard !loading, errorMessage == nil, !session.isHomeroomSupervisor, pane.selectedSegmentIndex == 0,
              let overview, row < rows.count, case let .item(_, _, _, classIndex?) = rows[row], classIndex < overview.classes.count else { return nil }
        return overview.classes[classIndex]
    }

    override func tableView(_ tableView: UITableView, didSelectRowAt indexPath: IndexPath) {
        tableView.deselectRow(at: indexPath, animated: true)
        guard let klass = classAt(indexPath.row), let year = years.first(where: { $0.id == yearId }) else { return }
        let context = DetailContext(yearId: year.id, classId: klass.id, date: date, from: year.startDate, to: year.endDate)
        let controller = HomeroomDetailViewController(repository: repository, context: context)
        controller.onClassDateChanged = { [weak self] selected in
            self?.date = selected
            self?.dayNavigator.setDate(selected)
        }
        navigationController?.pushViewController(controller, animated: true)
    }
}
