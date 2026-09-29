import UIKit

@MainActor
final class ChatCreateGroupViewController: UIViewController, UITableViewDataSource, UITableViewDelegate, UISearchBarDelegate {
    private let repository: ChatRepository
    private let onCreated: (String) -> Void
    private let nameField = UITextField()
    private let searchBar = UISearchBar()
    private let tableView = UITableView(frame: .zero, style: .plain)
    private let errorLabel = UILabel()
    private let submitButton = UIButton(type: .system)
    private var people: [ChatPerson]?
    private var visible: [ChatPerson] = []
    private var selected = Set<String>()
    private var saving = false

    init(repository: ChatRepository, onCreated: @escaping (String) -> Void) {
        self.repository = repository
        self.onCreated = onCreated
        super.init(nibName: nil, bundle: nil)
        title = "Tạo nhóm"
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemBackground
        navigationItem.largeTitleDisplayMode = .never
        nameField.placeholder = "Ví dụ: Tổ chuyên môn"
        nameField.borderStyle = .roundedRect
        nameField.accessibilityLabel = "Tên nhóm"
        nameField.addAction(UIAction { [weak self] _ in self?.updateSubmit() }, for: .editingChanged)
        searchBar.placeholder = "Tìm theo tên, email, phòng ban…"
        searchBar.delegate = self
        searchBar.searchBarStyle = .minimal
        errorLabel.textColor = .systemRed
        errorLabel.font = .preferredFont(forTextStyle: .footnote)
        errorLabel.numberOfLines = 0
        errorLabel.isHidden = true
        var config = UIButton.Configuration.filled()
        config.title = "Tạo nhóm"
        config.baseBackgroundColor = .systemBlue
        config.baseForegroundColor = .white
        config.cornerStyle = .medium
        submitButton.configuration = config
        submitButton.configurationUpdateHandler = { button in
            button.configuration?.baseBackgroundColor = button.isEnabled ? .systemBlue : UIColor.systemBlue.withAlphaComponent(0.38)
            button.configuration?.baseForegroundColor = .white
        }
        submitButton.addAction(UIAction { [weak self] _ in self?.submit() }, for: .touchUpInside)
        submitButton.heightAnchor.constraint(greaterThanOrEqualToConstant: 48).isActive = true
        tableView.dataSource = self
        tableView.delegate = self
        tableView.translatesAutoresizingMaskIntoConstraints = false
        let nameLabel = UILabel()
        nameLabel.text = "Tên nhóm"
        nameLabel.font = .preferredFont(forTextStyle: .subheadline)
        let memberLabel = UILabel()
        memberLabel.text = "Thành viên"
        memberLabel.font = .preferredFont(forTextStyle: .subheadline)
        let header = UIStackView(arrangedSubviews: [nameLabel, nameField, memberLabel, searchBar])
        header.axis = .vertical
        header.spacing = 8
        let footer = UIStackView(arrangedSubviews: [errorLabel, submitButton])
        footer.axis = .vertical
        footer.spacing = 8
        header.translatesAutoresizingMaskIntoConstraints = false
        footer.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(header)
        view.addSubview(tableView)
        view.addSubview(footer)
        NSLayoutConstraint.activate([
            header.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 12),
            header.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 16),
            header.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -16),
            tableView.topAnchor.constraint(equalTo: header.bottomAnchor, constant: 8),
            tableView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            tableView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            tableView.bottomAnchor.constraint(equalTo: footer.topAnchor, constant: -8),
            footer.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 16),
            footer.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -16),
            footer.bottomAnchor.constraint(equalTo: view.keyboardLayoutGuide.topAnchor, constant: -12),
        ])
        updateSubmit()
        Task { await loadPeople() }
    }

    func tableView(_ tableView: UITableView, numberOfRowsInSection section: Int) -> Int {
        max(visible.count, 1)
    }

    func tableView(_ tableView: UITableView, cellForRowAt indexPath: IndexPath) -> UITableViewCell {
        if people == nil {
            return noteCell("Đang tải danh sách…")
        }
        if visible.isEmpty {
            return noteCell("Không có nhân sự phù hợp.")
        }
        let person = visible[indexPath.row]
        let cell = UITableViewCell(style: .subtitle, reuseIdentifier: nil)
        var content = cell.defaultContentConfiguration()
        content.text = person.name
        content.secondaryText = [person.departmentName, person.email].filter { !$0.isEmpty }.joined(separator: " · ")
        cell.contentConfiguration = content
        cell.accessoryType = selected.contains(person.userId) ? .checkmark : .none
        cell.selectionStyle = saving ? .none : .default
        return cell
    }

    func tableView(_ tableView: UITableView, didSelectRowAt indexPath: IndexPath) {
        tableView.deselectRow(at: indexPath, animated: true)
        guard !saving, !visible.isEmpty else { return }
        let userId = visible[indexPath.row].userId
        if selected.contains(userId) { selected.remove(userId) } else { selected.insert(userId) }
        tableView.reloadRows(at: [indexPath], with: .none)
        updateSubmit()
    }

    func searchBar(_ searchBar: UISearchBar, textDidChange searchText: String) {
        applyFilter(searchText)
    }

    private func loadPeople() async {
        do {
            people = try await repository.directory()
            showError(nil)
        } catch {
            people = []
            showError(error)
        }
        applyFilter(searchBar.text ?? "")
    }

    private func applyFilter(_ query: String) {
        visible = (people ?? []).filter { person in
            chatSearchMatch("\(person.name) \(person.email) \(person.departmentName)", query)
        }
        tableView.reloadData()
    }

    private func updateSubmit() {
        let named = !(nameField.text ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        submitButton.isEnabled = named && !selected.isEmpty && !saving
        submitButton.configuration?.title = saving ? "Đang tạo…" : "Tạo nhóm"
    }

    private func submit() {
        let groupName = nameField.text ?? ""
        guard !saving else { return }
        saving = true
        updateSubmit()
        showError(nil)
        let memberIds = Array(selected)
        Task { [weak self] in
            guard let self else { return }
            do {
                let groupId = try await repository.createGroup(name: groupName, memberIds: memberIds)
                if groupId.isEmpty {
                    showError(nil)
                    errorLabel.text = "Không thực hiện được. Vui lòng thử lại."
                    errorLabel.isHidden = false
                } else {
                    navigationController?.popViewController(animated: false)
                    onCreated(groupId)
                }
            } catch {
                showError(error)
            }
            saving = false
            updateSubmit()
        }
    }

    private func showError(_ error: Error?) {
        if let error {
            errorLabel.text = chatHubFailureMessage("\(error.localizedDescription)")
            errorLabel.isHidden = false
        } else {
            errorLabel.isHidden = true
        }
    }

    private func noteCell(_ text: String) -> UITableViewCell {
        let cell = UITableViewCell(style: .default, reuseIdentifier: nil)
        cell.selectionStyle = .none
        var content = cell.defaultContentConfiguration()
        content.text = text
        content.textProperties.color = .secondaryLabel
        content.textProperties.numberOfLines = 0
        cell.contentConfiguration = content
        return cell
    }
}

@MainActor
final class ChatManageGroupViewController: UIViewController, UITableViewDataSource, UITableViewDelegate, UISearchBarDelegate {
    private let repository: ChatRepository
    private let groupId: String
    private let onLeft: () -> Void
    private let tableView = UITableView(frame: .zero, style: .insetGrouped)
    private let nameField = UITextField()
    private let renameButton = UIButton(type: .system)
    private let searchBar = UISearchBar()
    private let errorLabel = UILabel()
    private let headerStack = UIStackView()
    private var state: ChatGroupState?
    private var missing = false
    private var people: [ChatPerson] = []
    private var adding = Set<String>()
    private var searchText = ""
    private var pending = ""

    init(repository: ChatRepository, groupId: String, onLeft: @escaping () -> Void) {
        self.repository = repository
        self.groupId = groupId
        self.onLeft = onLeft
        super.init(nibName: nil, bundle: nil)
        title = "Thành viên nhóm"
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemGroupedBackground
        navigationItem.largeTitleDisplayMode = .never
        nameField.borderStyle = .roundedRect
        nameField.accessibilityLabel = "Tên nhóm"
        renameButton.configuration = .bordered()
        renameButton.configuration?.title = "Đổi tên"
        renameButton.addAction(UIAction { [weak self] _ in self?.rename() }, for: .touchUpInside)
        nameField.addAction(UIAction { [weak self] _ in
            guard let self else { return }
            let current = (self.nameField.text ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            self.renameButton.isEnabled = self.state?.canManage == true && current != self.state?.name
        }, for: .editingChanged)
        searchBar.placeholder = "Tìm theo tên, email, phòng ban…"
        searchBar.delegate = self
        searchBar.searchBarStyle = .minimal
        errorLabel.textColor = .systemRed
        errorLabel.numberOfLines = 0
        errorLabel.font = .preferredFont(forTextStyle: .footnote)
        headerStack.axis = .vertical
        headerStack.spacing = 8
        headerStack.isLayoutMarginsRelativeArrangement = true
        headerStack.layoutMargins = UIEdgeInsets(top: 12, left: 16, bottom: 8, right: 16)
        headerStack.addArrangedSubview(nameField)
        headerStack.addArrangedSubview(renameButton)
        tableView.dataSource = self
        tableView.delegate = self
        tableView.translatesAutoresizingMaskIntoConstraints = false
        tableView.tableHeaderView = headerStack
        errorLabel.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(tableView)
        view.addSubview(errorLabel)
        NSLayoutConstraint.activate([
            tableView.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            tableView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            tableView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            tableView.bottomAnchor.constraint(equalTo: errorLabel.topAnchor),
            errorLabel.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 16),
            errorLabel.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -16),
            errorLabel.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -8),
        ])
        Task { await reload() }
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        guard let header = tableView.tableHeaderView else { return }
        let width = tableView.bounds.width
        header.frame.size.width = width
        header.setNeedsLayout()
        header.layoutIfNeeded()
        let height = header.systemLayoutSizeFitting(CGSize(width: width, height: 0), withHorizontalFittingPriority: .required, verticalFittingPriority: .fittingSizeLevel).height
        if header.frame.height != height {
            header.frame.size.height = height
            tableView.tableHeaderView = header
        }
    }

    func numberOfSections(in tableView: UITableView) -> Int { 3 }

    func tableView(_ tableView: UITableView, numberOfRowsInSection section: Int) -> Int {
        switch section {
        case 0:
            if missing { return 1 }
            return max(state?.members.count ?? 1, 1)
        case 1:
            guard state?.canManage == true else { return 0 }
            return rowCountForAdd(candidates())
        default:
            return actions().count
        }
    }

    func tableView(_ tableView: UITableView, titleForHeaderInSection section: Int) -> String? {
        switch section {
        case 0: return "Thành viên"
        case 1: return state?.canManage == true ? "Thêm thành viên" : nil
        default: return nil
        }
    }

    func tableView(_ tableView: UITableView, cellForRowAt indexPath: IndexPath) -> UITableViewCell {
        if missing && indexPath.section == 0 {
            return note("Nhóm không còn tồn tại hoặc bạn không còn trong nhóm.")
        }
        if state == nil && indexPath.section == 0 {
            return note("Đang tải…")
        }
        switch indexPath.section {
        case 0:
            guard let members = state?.members, indexPath.row < members.count else { return note("Đang tải…") }
            let member = members[indexPath.row]
            let cell = UITableViewCell(style: .subtitle, reuseIdentifier: nil)
            var content = cell.defaultContentConfiguration()
            content.text = member.name
            let role = member.role == "owner" ? "Chủ nhóm" : "Thành viên"
            content.secondaryText = role + (member.isSelf ? " · Bạn" : "")
            cell.contentConfiguration = content
            cell.selectionStyle = .none
            if state?.canManage == true && member.role != "owner" {
                cell.accessoryView = removeButton(member.userId)
            }
            return cell
        case 1:
            let options = candidates()
            if indexPath.row == 0 { return searchCell() }
            if indexPath.row == rowCountForAdd(options) - 1 { return addButtonCell() }
            if options.isEmpty { return note("Không có nhân sự phù hợp.") }
            let person = options[indexPath.row - 1]
            let cell = UITableViewCell(style: .subtitle, reuseIdentifier: nil)
            var content = cell.defaultContentConfiguration()
            content.text = person.name
            content.secondaryText = [person.departmentName, person.email].filter { !$0.isEmpty }.joined(separator: " · ")
            cell.contentConfiguration = content
            cell.accessoryType = adding.contains(person.userId) ? .checkmark : .none
            return cell
        default:
            let action = actions()[indexPath.row]
            let cell = UITableViewCell(style: .default, reuseIdentifier: nil)
            var content = cell.defaultContentConfiguration()
            content.text = action.label
            content.textProperties.color = action.destructive ? .systemRed : .label
            cell.contentConfiguration = content
            return cell
        }
    }

    func tableView(_ tableView: UITableView, didSelectRowAt indexPath: IndexPath) {
        tableView.deselectRow(at: indexPath, animated: true)
        guard pending.isEmpty else { return }
        if indexPath.section == 1 {
            let options = candidates()
            let last = rowCountForAdd(options) - 1
            if indexPath.row == last {
                guard !adding.isEmpty else { return }
                let ids = Array(adding)
                run("add") {
                    try await self.repository.addMembers(groupId: self.groupId, memberIds: ids)
                    self.adding.removeAll()
                }
                return
            }
            guard indexPath.row > 0, indexPath.row - 1 < options.count else { return }
            let userId = options[indexPath.row - 1].userId
            if adding.contains(userId) { adding.remove(userId) } else { adding.insert(userId) }
            tableView.reloadSections(IndexSet(integer: 1), with: .none)
        }
        if indexPath.section == 2 {
            let action = actions()[indexPath.row]
            if action.id == "leave" {
                confirm(title: "Rời khỏi nhóm này?", actionTitle: "Rời nhóm") { [weak self] in
                    guard let self else { return }
                    self.run("leave", leaveAfter: true) { try await self.repository.leaveGroup(groupId: self.groupId) }
                }
            } else if action.id == "dissolve" {
                confirm(title: "Giải tán nhóm này?", actionTitle: "Giải tán") { [weak self] in
                    guard let self else { return }
                    self.run("dissolve", leaveAfter: true) { try await self.repository.dissolveGroup(groupId: self.groupId) }
                }
            }
        }
    }

    func searchBar(_ searchBar: UISearchBar, textDidChange searchText: String) {
        self.searchText = searchText
        tableView.reloadSections(IndexSet(integer: 1), with: .none)
    }

    private func rename() {
        guard pending.isEmpty, state?.canManage == true else { return }
        let current = (nameField.text ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        guard current != state?.name else { return }
        run("rename") { try await self.repository.renameGroup(groupId: self.groupId, name: current) }
    }

    private struct GroupAction {
        let id: String
        let label: String
        let destructive: Bool
    }

    private func actions() -> [GroupAction] {
        var items: [GroupAction] = []
        if state?.canLeave == true { items.append(GroupAction(id: "leave", label: "Rời nhóm", destructive: false)) }
        if state?.canDissolve == true { items.append(GroupAction(id: "dissolve", label: "Giải tán nhóm", destructive: true)) }
        return items
    }

    private func rowCountForAdd(_ options: [ChatPerson]) -> Int {
        1 + (options.isEmpty ? 1 : options.count) + 1
    }

    private func searchCell() -> UITableViewCell {
        let cell = UITableViewCell(style: .default, reuseIdentifier: nil)
        cell.selectionStyle = .none
        searchBar.removeFromSuperview()
        searchBar.translatesAutoresizingMaskIntoConstraints = false
        cell.contentView.addSubview(searchBar)
        NSLayoutConstraint.activate([
            searchBar.leadingAnchor.constraint(equalTo: cell.contentView.leadingAnchor),
            searchBar.trailingAnchor.constraint(equalTo: cell.contentView.trailingAnchor),
            searchBar.topAnchor.constraint(equalTo: cell.contentView.topAnchor),
            searchBar.bottomAnchor.constraint(equalTo: cell.contentView.bottomAnchor),
        ])
        return cell
    }

    private func addButtonCell() -> UITableViewCell {
        let cell = UITableViewCell(style: .default, reuseIdentifier: nil)
        var content = cell.defaultContentConfiguration()
        content.text = "Thêm vào nhóm"
        content.textProperties.color = adding.isEmpty ? .tertiaryLabel : .systemBlue
        cell.contentConfiguration = content
        cell.selectionStyle = adding.isEmpty ? .none : .default
        return cell
    }

    private func candidates() -> [ChatPerson] {
        let memberIds = Set(state?.members.map(\.userId) ?? [])
        return people.filter { person in
            !memberIds.contains(person.userId) && chatSearchMatch("\(person.name) \(person.email) \(person.departmentName)", searchText)
        }
    }

    private func reload() async {
        do {
            let loaded = try await repository.groupState(groupId: groupId)
            if let loaded {
                missing = false
                if nameField.text?.isEmpty != false || pending == "rename" {
                    nameField.text = loaded.name
                }
                state = loaded
                nameField.isEnabled = loaded.canManage
                renameButton.isHidden = !loaded.canManage
                renameButton.isEnabled = loaded.canManage && (nameField.text ?? "") != loaded.name
                if loaded.canManage && people.isEmpty {
                    people = (try? await repository.directory()) ?? []
                }
            } else if state == nil {
                missing = true
            }
            errorLabel.text = nil
        } catch {
            errorLabel.text = chatHubFailureMessage(error.localizedDescription)
        }
        tableView.reloadData()
    }

    private func run(_ key: String, leaveAfter: Bool = false, action: @escaping () async throws -> Void) {
        pending = key
        Task { [weak self] in
            guard let self else { return }
            do {
                try await action()
                if leaveAfter {
                    onLeft()
                } else {
                    await reload()
                }
            } catch {
                errorLabel.text = chatHubFailureMessage(error.localizedDescription)
            }
            pending = ""
        }
    }

    private func confirm(title prompt: String, actionTitle: String, action: @escaping () -> Void) {
        let alert = UIAlertController(title: prompt, message: nil, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "Hủy", style: .cancel))
        alert.addAction(UIAlertAction(title: actionTitle, style: .destructive, handler: { _ in action() }))
        present(alert, animated: true)
    }

    private func removeButton(_ userId: String) -> UIButton {
        let button = UIButton(type: .system)
        button.setTitle("Xóa", for: .normal)
        button.addAction(UIAction { [weak self] _ in
            guard let self, self.pending.isEmpty else { return }
            self.run("remove") { try await self.repository.removeMember(groupId: self.groupId, userId: userId) }
        }, for: .touchUpInside)
        return button
    }

    private func note(_ text: String) -> UITableViewCell {
        let cell = UITableViewCell(style: .default, reuseIdentifier: nil)
        cell.selectionStyle = .none
        var content = cell.defaultContentConfiguration()
        content.text = text
        content.textProperties.numberOfLines = 0
        content.textProperties.color = .secondaryLabel
        cell.contentConfiguration = content
        return cell
    }
}
