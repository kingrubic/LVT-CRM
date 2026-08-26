import UIKit
import PhotosUI
import UniformTypeIdentifiers

@MainActor
final class WorkCreateViewController: UIViewController, UITextViewDelegate, UIDocumentPickerDelegate, PHPickerViewControllerDelegate {
    private let viewModel: WorkViewModel
    private let onCreated: () -> Void

    private let scrollView = UIScrollView()
    private let stackView = UIStackView()
    private let titleField = UITextField()
    private let addRow = UIStackView()
    private let assignmentsStack = UIStackView()
    private let fileLabel = UILabel()
    private let errorLabel = UILabel()
    private let submitButton = UIButton(type: .system)
    private let spinner = UIActivityIndicatorView(style: .medium)

    private var options: WorkFormOptions?
    private var assignments: [WorkCreateAssignment] = []
    private var fileData: Data?
    private var fileName = ""
    private var fileMime = ""
    private var isBusy = false

    private static let maxUploadFileSize = 20 * 1024 * 1024
    private static let allowedUploadExtensions: Set<String> = ["pdf", "docx", "xlsx", "xls", "png", "jpg", "jpeg"]

    init(viewModel: WorkViewModel, onCreated: @escaping () -> Void) {
        self.viewModel = viewModel
        self.onCreated = onCreated
        super.init(nibName: nil, bundle: nil)
        title = "Tạo công việc"
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemGroupedBackground
        navigationItem.largeTitleDisplayMode = .never
        configureViews()
        configureLayout()
        rebuildAssignments()
        Task { await loadOptions() }
    }

    private func configureViews() {
        scrollView.keyboardDismissMode = .interactive
        scrollView.translatesAutoresizingMaskIntoConstraints = false
        stackView.axis = .vertical
        stackView.spacing = 14
        stackView.translatesAutoresizingMaskIntoConstraints = false

        titleField.placeholder = "Tên công việc"
        titleField.borderStyle = .roundedRect
        titleField.font = .preferredFont(forTextStyle: .body)
        titleField.adjustsFontForContentSizeCategory = true
        titleField.accessibilityLabel = "Tên công việc"

        addRow.axis = .horizontal
        addRow.spacing = 8
        addRow.distribution = .fillEqually
        let addPerson = UIButton(type: .system)
        addPerson.setTitle("＋ Cá nhân", for: .normal)
        addPerson.addTarget(self, action: #selector(addIndividual), for: .touchUpInside)
        addRow.addArrangedSubview(addPerson)

        assignmentsStack.axis = .vertical
        assignmentsStack.spacing = 12

        fileLabel.font = .preferredFont(forTextStyle: .body)
        fileLabel.adjustsFontForContentSizeCategory = true
        fileLabel.numberOfLines = 0
        fileLabel.textColor = .secondaryLabel
        fileLabel.text = "Tệp đính kèm (không bắt buộc)"

        errorLabel.font = .preferredFont(forTextStyle: .footnote)
        errorLabel.adjustsFontForContentSizeCategory = true
        errorLabel.textColor = .systemRed
        errorLabel.numberOfLines = 0
        errorLabel.isHidden = true

        submitButton.setTitle("Tạo công việc", for: .normal)
        submitButton.titleLabel?.font = .preferredFont(forTextStyle: .headline)
        submitButton.addTarget(self, action: #selector(submit), for: .touchUpInside)

        spinner.hidesWhenStopped = true
    }

    private func configureLayout() {
        view.addSubview(scrollView)
        scrollView.addSubview(stackView)
        let photoButton = outlineButton("Chọn từ Thư viện ảnh", action: #selector(pickPhoto))
        let fileButton = outlineButton("Chọn từ Tệp (PDF, Word, Excel)", action: #selector(pickFile))
        let clearFile = UIButton(type: .system)
        clearFile.setTitle("Gỡ tệp", for: .normal)
        clearFile.addTarget(self, action: #selector(removeFile), for: .touchUpInside)

        [
            titleField,
            addRow,
            assignmentsStack,
            fileLabel,
            photoButton,
            fileButton,
            clearFile,
            errorLabel,
            submitButton,
            spinner,
        ].forEach { stackView.addArrangedSubview($0) }

        NSLayoutConstraint.activate([
            scrollView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            scrollView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            scrollView.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            scrollView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            stackView.leadingAnchor.constraint(equalTo: scrollView.contentLayoutGuide.leadingAnchor, constant: 16),
            stackView.trailingAnchor.constraint(equalTo: scrollView.contentLayoutGuide.trailingAnchor, constant: -16),
            stackView.topAnchor.constraint(equalTo: scrollView.contentLayoutGuide.topAnchor, constant: 16),
            stackView.bottomAnchor.constraint(equalTo: scrollView.contentLayoutGuide.bottomAnchor, constant: -28),
            stackView.widthAnchor.constraint(equalTo: scrollView.frameLayoutGuide.widthAnchor, constant: -32),
        ])
    }

    private func outlineButton(_ title: String, action: Selector) -> UIButton {
        let button = UIButton(type: .system)
        button.setTitle(title, for: .normal)
        button.addTarget(self, action: action, for: .touchUpInside)
        return button
    }

    private func loadOptions() async {
        do {
            let loaded = try await viewModel.loadFormOptions()
            options = loaded
            if loaded.isOps, addRow.arrangedSubviews.count == 1 {
                let addDepartment = UIButton(type: .system)
                addDepartment.setTitle("＋ Phòng ban", for: .normal)
                addDepartment.addTarget(self, action: #selector(addDepartmentAssignment), for: .touchUpInside)
                addRow.insertArrangedSubview(addDepartment, at: 0)
            }
            rebuildAssignments()
        } catch {
            showError((error as? ConvexException)?.message ?? ConvexHttpClient.humanize(error.localizedDescription))
        }
    }

    @objc private func addIndividual() {
        var row = WorkCreateAssignment.individual()
        row.deadline = WorkCreatePolicy.formatDeadline(Date())
        assignments.append(row)
        rebuildAssignments()
    }

    @objc private func addDepartmentAssignment() {
        var row = WorkCreateAssignment.department()
        row.deadline = WorkCreatePolicy.formatDeadline(Date())
        assignments.append(row)
        rebuildAssignments()
    }

    private func rebuildAssignments() {
        assignmentsStack.arrangedSubviews.forEach { $0.removeFromSuperview() }
        if assignments.isEmpty {
            let empty = UILabel()
            empty.text = (options?.isOps == true)
                ? "Bấm ＋ Phòng ban hoặc ＋ Cá nhân để thêm người nhận việc."
                : "Bấm ＋ Cá nhân để thêm người nhận việc."
            empty.font = .preferredFont(forTextStyle: .subheadline)
            empty.textColor = .secondaryLabel
            empty.numberOfLines = 0
            assignmentsStack.addArrangedSubview(empty)
            return
        }
        for (index, row) in assignments.enumerated() {
            assignmentsStack.addArrangedSubview(makeAssignmentCard(index: index, row: row))
        }
    }

    private func makeAssignmentCard(index: Int, row: WorkCreateAssignment) -> UIView {
        let card = UIStackView()
        card.axis = .vertical
        card.spacing = 8
        card.isLayoutMarginsRelativeArrangement = true
        card.layoutMargins = UIEdgeInsets(top: 12, left: 12, bottom: 12, right: 12)
        card.backgroundColor = .secondarySystemGroupedBackground
        card.layer.cornerRadius = 12

        let header = UIStackView()
        header.axis = .horizontal
        let title = UILabel()
        title.font = .preferredFont(forTextStyle: .headline)
        title.text = row.isIndividual ? "Phân công \(index + 1) · Cá nhân" : "Phân công \(index + 1) · Phòng ban"
        title.numberOfLines = 0
        let remove = UIButton(type: .system)
        remove.setTitle("Xóa", for: .normal)
        remove.tag = index
        remove.addTarget(self, action: #selector(removeAssignment(_:)), for: .touchUpInside)
        header.addArrangedSubview(title)
        header.addArrangedSubview(remove)

        let pick = UIButton(type: .system)
        pick.tag = index
        pick.contentHorizontalAlignment = .leading
        pick.addTarget(self, action: #selector(pickTarget(_:)), for: .touchUpInside)
        if row.isIndividual {
            let user = options?.users.first { $0.id == row.userIds.first }
            pick.setTitle(user.map { "\($0.name)\($0.departmentName.isEmpty ? "" : " · \($0.departmentName)")" } ?? "Chọn người nhận", for: .normal)
        } else {
            let department = options?.departments.first { $0.id == row.departmentId }
            pick.setTitle(department?.name ?? "Chọn phòng ban", for: .normal)
        }

        let content = UITextView()
        content.font = .preferredFont(forTextStyle: .body)
        content.adjustsFontForContentSizeCategory = true
        content.layer.borderWidth = 1
        content.layer.borderColor = UIColor.separator.cgColor
        content.layer.cornerRadius = 8
        content.text = row.content
        content.tag = index
        content.delegate = self
        content.heightAnchor.constraint(greaterThanOrEqualToConstant: 72).isActive = true
        content.accessibilityLabel = "Nội dung công việc"

        let datePicker = UIDatePicker()
        datePicker.datePickerMode = .date
        datePicker.preferredDatePickerStyle = .compact
        datePicker.timeZone = TimeZone(secondsFromGMT: 7 * 3600)
        datePicker.tag = index
        datePicker.addTarget(self, action: #selector(deadlineChanged(_:)), for: .valueChanged)
        if let parsed = parseDeadline(row.deadline) {
            datePicker.date = parsed
        }

        card.addArrangedSubview(header)
        card.addArrangedSubview(pick)
        card.addArrangedSubview(content)
        card.addArrangedSubview(datePicker)
        return card
    }

    func textViewDidChange(_ textView: UITextView) {
        let index = textView.tag
        guard assignments.indices.contains(index) else { return }
        assignments[index].content = String(textView.text.prefix(2000))
    }

    @objc private func deadlineChanged(_ sender: UIDatePicker) {
        let index = sender.tag
        guard assignments.indices.contains(index) else { return }
        assignments[index].deadline = WorkCreatePolicy.formatDeadline(sender.date)
    }

    @objc private func removeAssignment(_ sender: UIButton) {
        let index = sender.tag
        guard assignments.indices.contains(index) else { return }
        assignments.remove(at: index)
        rebuildAssignments()
    }

    @objc private func pickTarget(_ sender: UIButton) {
        let index = sender.tag
        guard assignments.indices.contains(index) else { return }
        let row = assignments[index]
        let items: [(String, String)]
        if row.isIndividual {
            let selected = Set(assignments.filter(\.isIndividual).flatMap(\.userIds))
            items = (options?.users ?? []).compactMap { user in
                if user.id == row.userIds.first || !selected.contains(user.id) {
                    let label = user.departmentName.isEmpty ? user.name : "\(user.name) · \(user.departmentName)"
                    return (user.id, label)
                }
                return nil
            }
        } else {
            let selected = Set(assignments.filter { !$0.isIndividual }.map(\.departmentId))
            items = (options?.departments ?? []).compactMap { department in
                if department.id == row.departmentId || !selected.contains(department.id) {
                    return (department.id, department.name)
                }
                return nil
            }
        }
        let picker = WorkChoiceViewController(
            titleText: row.isIndividual ? "Chọn người nhận" : "Chọn phòng ban",
            items: items
        ) { [weak self] id in
            guard let self, self.assignments.indices.contains(index) else { return }
            if self.assignments[index].isIndividual {
                self.assignments[index].userIds = [id]
            } else {
                self.assignments[index].departmentId = id
            }
            self.rebuildAssignments()
        }
        navigationController?.pushViewController(picker, animated: !UIAccessibility.isReduceMotionEnabled)
    }

    @objc private func pickPhoto() {
        var configuration = PHPickerConfiguration(photoLibrary: .shared())
        configuration.filter = .images
        configuration.selectionLimit = 1
        let picker = PHPickerViewController(configuration: configuration)
        picker.delegate = self
        present(picker, animated: !UIAccessibility.isReduceMotionEnabled)
    }

    @objc private func pickFile() {
        let types: [UTType] = [
            .pdf,
            .image,
            UTType(filenameExtension: "docx") ?? .data,
            UTType(filenameExtension: "xlsx") ?? .data,
            UTType(filenameExtension: "xls") ?? .data,
        ]
        let picker = UIDocumentPickerViewController(forOpeningContentTypes: types, asCopy: true)
        picker.delegate = self
        picker.allowsMultipleSelection = false
        present(picker, animated: !UIAccessibility.isReduceMotionEnabled)
    }

    @objc private func removeFile() {
        fileData = nil
        fileName = ""
        fileMime = ""
        fileLabel.text = "Tệp đính kèm (không bắt buộc)"
    }

    func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
        guard let url = urls.first else { return }
        let ext = url.pathExtension.lowercased()
        guard Self.allowedUploadExtensions.contains(ext) else {
            showError("Chỉ chấp nhận tệp PDF, DOCX, Excel, PNG hoặc JPG.")
            return
        }
        let accessing = url.startAccessingSecurityScopedResource()
        defer { if accessing { url.stopAccessingSecurityScopedResource() } }
        do {
            let data = try Data(contentsOf: url)
            guard !data.isEmpty else {
                showError("Tệp rỗng, vui lòng chọn lại.")
                return
            }
            guard data.count <= Self.maxUploadFileSize else {
                showError("Dung lượng tệp tối đa là 20MB.")
                return
            }
            fileData = data
            fileName = url.lastPathComponent
            fileMime = mimeType(for: url)
            fileLabel.text = fileName
        } catch {
            showError("Không thể đọc tệp đã chọn. Vui lòng thử lại.")
        }
    }

    func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
        picker.dismiss(animated: true)
        guard let result = results.first else { return }
        let itemProvider = result.itemProvider
        guard itemProvider.canLoadObject(ofClass: UIImage.self) else {
            showError("Không thể tải ảnh đã chọn.")
            return
        }
        itemProvider.loadObject(ofClass: UIImage.self) { [weak self] object, _ in
            guard let self, let image = object as? UIImage, let data = image.jpegData(compressionQuality: 0.85) else {
                DispatchQueue.main.async { self?.showError("Không thể đọc ảnh đã chọn.") }
                return
            }
            DispatchQueue.main.async {
                guard data.count <= Self.maxUploadFileSize else {
                    self.showError("Dung lượng ảnh tối đa là 20MB.")
                    return
                }
                let formatter = DateFormatter()
                formatter.dateFormat = "yyyyMMdd_HHmmss"
                self.fileData = data
                self.fileName = "dinh_kem_\(formatter.string(from: Date())).jpg"
                self.fileMime = "image/jpeg"
                self.fileLabel.text = self.fileName
            }
        }
    }

    @objc private func submit() {
        guard !isBusy else { return }
        hideError()
        if let message = WorkCreatePolicy.validate(title: titleField.text ?? "", assignments: assignments) {
            showError(message)
            return
        }
        isBusy = true
        submitButton.isEnabled = false
        spinner.startAnimating()
        Task {
            do {
                try await viewModel.submitCreate(
                    title: titleField.text ?? "",
                    assignments: assignments,
                    fileData: fileData,
                    fileName: fileName.isEmpty ? nil : fileName,
                    mimeType: fileMime.isEmpty ? nil : fileMime
                )
                onCreated()
                navigationController?.popViewController(animated: !UIAccessibility.isReduceMotionEnabled)
            } catch {
                showError((error as? ConvexException)?.message ?? ConvexHttpClient.humanize(error.localizedDescription))
                isBusy = false
                submitButton.isEnabled = true
                spinner.stopAnimating()
            }
        }
    }

    private func parseDeadline(_ value: String) -> Date? {
        let parts = value.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3 else { return nil }
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(secondsFromGMT: 7 * 3600) ?? .current
        return calendar.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2]))
    }

    private func mimeType(for url: URL) -> String {
        switch url.pathExtension.lowercased() {
        case "pdf": return "application/pdf"
        case "docx": return "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        case "xlsx": return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        case "xls": return "application/vnd.ms-excel"
        case "png": return "image/png"
        case "jpg", "jpeg": return "image/jpeg"
        default: return "application/octet-stream"
        }
    }

    private func showError(_ message: String) {
        errorLabel.text = message
        errorLabel.isHidden = false
    }

    private func hideError() {
        errorLabel.text = nil
        errorLabel.isHidden = true
    }
}

private final class WorkChoiceViewController: UITableViewController {
    private let items: [(String, String)]
    private let onSelect: (String) -> Void

    init(titleText: String, items: [(String, String)], onSelect: @escaping (String) -> Void) {
        self.items = items
        self.onSelect = onSelect
        super.init(style: .insetGrouped)
        title = titleText
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    override func tableView(_ tableView: UITableView, numberOfRowsInSection section: Int) -> Int {
        max(items.count, 1)
    }

    override func tableView(_ tableView: UITableView, cellForRowAt indexPath: IndexPath) -> UITableViewCell {
        let cell = tableView.dequeueReusableCell(withIdentifier: "Choice") ?? UITableViewCell(style: .subtitle, reuseIdentifier: "Choice")
        if items.isEmpty {
            cell.textLabel?.text = "Không còn lựa chọn phù hợp."
            cell.selectionStyle = .none
        } else {
            cell.textLabel?.text = items[indexPath.row].1
            cell.accessoryType = .disclosureIndicator
        }
        cell.textLabel?.numberOfLines = 0
        return cell
    }

    override func tableView(_ tableView: UITableView, didSelectRowAt indexPath: IndexPath) {
        tableView.deselectRow(at: indexPath, animated: true)
        guard items.indices.contains(indexPath.row) else { return }
        onSelect(items[indexPath.row].0)
        navigationController?.popViewController(animated: !UIAccessibility.isReduceMotionEnabled)
    }
}
