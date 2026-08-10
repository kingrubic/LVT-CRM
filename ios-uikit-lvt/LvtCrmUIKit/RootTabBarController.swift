import UIKit

/// Authenticated UIKit shell.
final class RootTabBarController: UITabBarController {
    private let session: UserSession
    private let authRepository: AuthRepository
    private let sessionsRepository: SessionsRepository
    private let notificationsRepository: NotificationsRepository
    private let dutiesRepository: DutiesRepository
    private let workRepository: WorkRepository
    private var tabControllers: [AppTab: UINavigationController] = [:]
    private weak var notificationsViewController: NotificationsViewController?
    private weak var dutiesViewController: DutiesViewController?
    private weak var workViewController: WorkViewController?

    init(
        session: UserSession,
        authRepository: AuthRepository,
        sessionsRepository: SessionsRepository,
        notificationsRepository: NotificationsRepository,
        dutiesRepository: DutiesRepository,
        workRepository: WorkRepository
    ) {
        self.session = session
        self.authRepository = authRepository
        self.sessionsRepository = sessionsRepository
        self.notificationsRepository = notificationsRepository
        self.dutiesRepository = dutiesRepository
        self.workRepository = workRepository
        super.init(nibName: nil, bundle: nil)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    override func viewDidLoad() {
        super.viewDidLoad()
        let overview = navigationController(
                title: "Tổng quan",
                systemImage: "rectangle.grid.2x2",
                viewController: PlaceholderViewController(
                    title: "Tổng quan",
                    message: "Các tính năng CRM sẽ được chuyển đổi ở lane khác."
                )
            )
        let notificationsViewController = NotificationsViewController(
            viewModel: NotificationsViewModel(repository: notificationsRepository),
            onOpenDestination: { [weak self] destination in
                self?.route(destination, markNotificationRead: false)
            }
        )
        let notifications = navigationController(
            title: "Thông báo",
            systemImage: "bell",
            viewController: notificationsViewController
        )
        let dutiesViewController = DutiesViewController(
            viewModel: DutiesViewModel(repository: dutiesRepository)
        )
        let duties = navigationController(
            title: "Công tác",
            systemImage: "briefcase",
            viewController: dutiesViewController
        )
        let workViewController = WorkViewController(
            viewModel: WorkViewModel(repository: workRepository)
        )
        let work = navigationController(
            title: "Công việc",
            systemImage: "checkmark.seal",
            viewController: workViewController
        )
        let profile = navigationController(
                title: "Cá nhân",
                systemImage: "person.crop.circle",
                viewController: ProfileViewController(
                    session: session,
                    authRepository: authRepository,
                    sessionsRepository: sessionsRepository
                )
            )
        tabControllers = [
            .notifications: notifications,
            .duties: duties,
            .work: work,
            .profile: profile,
        ]
        self.notificationsViewController = notificationsViewController
        self.dutiesViewController = dutiesViewController
        self.workViewController = workViewController
        viewControllers = [overview, notifications, duties, work, profile]
        Task { await sessionsRepository.registerCurrentDevice() }
    }

    func route(_ destination: NotificationDestination, markNotificationRead: Bool = true) {
        let tab = destination.route
        guard let navigationController = tabControllers[tab] else { return }
        selectedViewController = navigationController
        navigationController.popToRootViewController(animated: false)
        if tab == .duties {
            dutiesViewController?.focus(dutyId: destination.sourceId)
        } else if tab == .work {
            workViewController?.focus(itemId: destination.sourceId)
        }
        if markNotificationRead, let key = destination.notificationKey {
            Task { [weak self] in
                guard let self else { return }
                try? await notificationsRepository.markRead(notificationKey: key)
                notificationsViewController?.refreshAfterDestination()
            }
        }
    }

    private func navigationController(
        title: String,
        systemImage: String,
        viewController: UIViewController
    ) -> UINavigationController {
        let navigationController = UINavigationController(rootViewController: viewController)
        navigationController.navigationBar.prefersLargeTitles = true
        navigationController.tabBarItem = UITabBarItem(
            title: title,
            image: UIImage(systemName: systemImage),
            selectedImage: nil
        )
        return navigationController
    }
}

private final class PlaceholderViewController: UIViewController {
    private let message: String
    private let messageLabel = UILabel()

    init(title: String, message: String) {
        self.message = message
        super.init(nibName: nil, bundle: nil)
        self.title = title
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemGroupedBackground
        messageLabel.text = message
        messageLabel.font = .preferredFont(forTextStyle: .body)
        messageLabel.adjustsFontForContentSizeCategory = true
        messageLabel.textAlignment = .center
        messageLabel.textColor = .secondaryLabel
        messageLabel.numberOfLines = 0
        messageLabel.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(messageLabel)
        NSLayoutConstraint.activate([
            messageLabel.leadingAnchor.constraint(equalTo: view.layoutMarginsGuide.leadingAnchor),
            messageLabel.trailingAnchor.constraint(equalTo: view.layoutMarginsGuide.trailingAnchor),
            messageLabel.centerYAnchor.constraint(equalTo: view.centerYAnchor),
        ])
    }

    func show(_ destination: NotificationDestination) {
        loadViewIfNeeded()
        messageLabel.text = "\(message)\n\nĐã chuyển đến đúng tab cho mục \(destination.sourceId)."
        messageLabel.accessibilityLabel = "\(message) Đã chuyển đến đúng tab cho thông báo đã chọn."
    }
}
