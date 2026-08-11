import UIKit

@MainActor
final class ProfileViewController: UITableViewController {
    private enum Appearance: String, CaseIterable {
        case system
        case light
        case dark

        var title: String {
            switch self {
            case .system: return "Theo hệ thống"
            case .light: return "Sáng"
            case .dark: return "Tối"
            }
        }

        var interfaceStyle: UIUserInterfaceStyle {
            switch self {
            case .system: return .unspecified
            case .light: return .light
            case .dark: return .dark
            }
        }
    }

    private static let appearanceDefaultsKey = "lvt_uikit_appearance"

    private enum Section: Int, CaseIterable {
        case identity
        case work
        case account
        case appearance
        case signOut
    }

    private let session: UserSession
    private let authRepository: AuthRepository
    private let sessionsRepository: SessionsRepository

    init(
        session: UserSession,
        authRepository: AuthRepository,
        sessionsRepository: SessionsRepository
    ) {
        self.session = session
        self.authRepository = authRepository
        self.sessionsRepository = sessionsRepository
        super.init(style: .insetGrouped)
        title = "Cá nhân"
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    override func viewDidLoad() {
        super.viewDidLoad()
        tableView.backgroundColor = .systemGroupedBackground
        tableView.cellLayoutMarginsFollowReadableWidth = true
        tableView.register(UITableViewCell.self, forCellReuseIdentifier: "Cell")
    }

    override func numberOfSections(in tableView: UITableView) -> Int {
        Section.allCases.count
    }

    override func tableView(_ tableView: UITableView, numberOfRowsInSection section: Int) -> Int {
        switch Section(rawValue: section) {
        case .identity: return 2
        case .work: return 3
        case .account: return 2
        case .appearance: return 1
        case .signOut: return 1
        case nil: return 0
        }
    }

    override func tableView(_ tableView: UITableView, titleForHeaderInSection section: Int) -> String? {
        switch Section(rawValue: section) {
        case .identity: return "Tài khoản"
        case .work: return "Thông tin công việc"
        case .account: return "Bảo mật"
        case .appearance: return "Giao diện"
        case .signOut, nil: return nil
        }
    }

    override func tableView(
        _ tableView: UITableView,
        cellForRowAt indexPath: IndexPath
    ) -> UITableViewCell {
        let cell = tableView.dequeueReusableCell(withIdentifier: "Cell", for: indexPath)
        var content = cell.defaultContentConfiguration()
        content.textProperties.numberOfLines = 0
        content.secondaryTextProperties.numberOfLines = 0
        content.imageProperties.maximumSize = CGSize(width: 44, height: 44)
        cell.accessoryType = .none
        cell.selectionStyle = .none
        cell.accessibilityTraits = []

        switch Section(rawValue: indexPath.section) {
        case .identity:
            if indexPath.row == 0 {
                content.text = session.name
                content.secondaryText = session.email
                content.textProperties.font = .preferredFont(forTextStyle: .title3)
                content.image = UIImage(systemName: "person.crop.circle.fill")
                content.imageProperties.tintColor = .systemIndigo
                cell.accessibilityLabel = "(session.name), (session.email)"
                cell.accessibilityTraits = .header
            } else {
                content.text = "Vai trò"
                content.secondaryText = session.roleLabel
                cell.accessibilityLabel = "Vai trò, (session.roleLabel)"
            }
        case .work:
            let values = [
                ("Vai trò", session.roleLabel),
                ("Tổ hoặc phòng", session.departmentName ?? "Chưa cập nhật"),
                ("Chức vụ", session.positionName ?? "Chưa cập nhật"),
            ]
            content.text = values[indexPath.row].0
            content.secondaryText = values[indexPath.row].1
            cell.accessibilityLabel = "(values[indexPath.row].0), (values[indexPath.row].1)"
        case .account:
            let isDevices = indexPath.row == 0
            content.text = isDevices ? "Thiết bị đã đăng nhập" : "Đổi mật khẩu"
            content.image = UIImage(systemName: isDevices ? "laptopcomputer.and.iphone" : "key")
            content.imageProperties.tintColor = .systemIndigo
            cell.accessoryType = .disclosureIndicator
            cell.selectionStyle = .default
            cell.accessibilityTraits = .button
            cell.accessibilityHint = isDevices
                ? "Mở danh sách các phiên đăng nhập"
                : "Mở màn hình đổi mật khẩu"
        case .appearance:
            content.text = "Chế độ hiển thị"
            content.secondaryText = currentAppearance.title
            content.image = UIImage(systemName: "circle.lefthalf.filled")
            content.imageProperties.tintColor = .systemIndigo
            cell.accessoryType = .disclosureIndicator
            cell.selectionStyle = .default
            cell.accessibilityTraits = .button
            cell.accessibilityLabel = "Chế độ hiển thị, \(currentAppearance.title)"
            cell.accessibilityHint = "Chọn giao diện sáng, tối hoặc theo hệ thống"
        case .signOut:
            content.text = "Đăng xuất"
            content.image = UIImage(systemName: "rectangle.portrait.and.arrow.right")
            content.textProperties.color = .systemRed
            content.imageProperties.tintColor = .systemRed
            cell.selectionStyle = .default
            cell.accessibilityTraits = .button
            cell.accessibilityHint = "Đăng xuất khỏi tài khoản này"
        case nil:
            break
        }
        cell.contentConfiguration = content
        return cell
    }

    override func tableView(_ tableView: UITableView, didSelectRowAt indexPath: IndexPath) {
        tableView.deselectRow(at: indexPath, animated: true)
        switch Section(rawValue: indexPath.section) {
        case .account where indexPath.row == 0:
            navigationController?.pushViewController(
                DevicesViewController(sessionsRepository: sessionsRepository),
                animated: true
            )
        case .account:
            showChangePassword()
        case .appearance:
            showAppearancePicker()
        case .signOut:
            confirmSignOut()
        default:
            break
        }
    }

    private var currentAppearance: Appearance {
        Appearance(rawValue: UserDefaults.standard.string(forKey: Self.appearanceDefaultsKey) ?? "") ?? .system
    }

    private func showAppearancePicker() {
        let alert = UIAlertController(
            title: "Chế độ hiển thị",
            message: "Chọn giao diện cho LVT CRM.",
            preferredStyle: .actionSheet
        )
        for appearance in Appearance.allCases {
            let action = UIAlertAction(title: appearance.title, style: .default) { [weak self] _ in
                self?.apply(appearance: appearance)
            }
            alert.addAction(action)
        }
        alert.addAction(UIAlertAction(title: "Hủy", style: .cancel))
        if let popover = alert.popoverPresentationController {
            popover.sourceView = tableView
            popover.sourceRect = tableView.rectForRow(at: IndexPath(row: 0, section: Section.appearance.rawValue))
        }
        present(alert, animated: true)
    }

    private func apply(appearance: Appearance) {
        UserDefaults.standard.set(appearance.rawValue, forKey: Self.appearanceDefaultsKey)
        view.window?.windowScene?.windows.forEach { $0.overrideUserInterfaceStyle = appearance.interfaceStyle }
        tableView.reloadSections(IndexSet(integer: Section.appearance.rawValue), with: .none)
    }

    private func showChangePassword() {
        let controller = ChangePasswordViewController(
            title: "Đổi mật khẩu",
            subtitle: "Đặt mật khẩu mới cho tài khoản của bạn.",
            authRepository: authRepository,
            allowsCancel: true,
            onDone: { [weak self] in self?.navigationController?.popViewController(animated: true) }
        )
        navigationController?.pushViewController(controller, animated: true)
    }

    private func confirmSignOut() {
        let alert = UIAlertController(
            title: "Đăng xuất?",
            message: "Bạn sẽ cần đăng nhập lại để tiếp tục sử dụng LVT CRM.",
            preferredStyle: .alert
        )
        alert.addAction(UIAlertAction(title: "Hủy", style: .cancel))
        alert.addAction(UIAlertAction(title: "Đăng xuất", style: .destructive) { [weak self] _ in
            self?.authRepository.signOut()
        })
        present(alert, animated: true)
    }
}
