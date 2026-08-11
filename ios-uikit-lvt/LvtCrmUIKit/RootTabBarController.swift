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
        let overviewViewController = DashboardViewController(
            dutiesRepository: dutiesRepository,
            workRepository: workRepository,
            onOpenDuties: { [weak self] in self?.selectTab(.duties) },
            onOpenWork: { [weak self] in self?.selectTab(.work) }
        )
        let overview = navigationController(
            title: "Tổng quan",
            systemImage: "rectangle.grid.2x2",
            viewController: overviewViewController
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

    private func selectTab(_ tab: AppTab) {
        selectedViewController = tabControllers[tab]
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

@MainActor
private final class DashboardViewController: UIViewController {
    private let dutiesRepository: DutiesRepository
    private let workRepository: WorkRepository
    private let onOpenDuties: () -> Void
    private let onOpenWork: () -> Void
    private let dutiesCard = DashboardCard(title: "Công tác", icon: "briefcase.fill", tint: .systemBlue)
    private let workCard = DashboardCard(title: "Công việc", icon: "checkmark.seal.fill", tint: .systemGreen)
    private let statusLabel = UILabel()
    private var refreshTask: Task<Void, Never>?

    init(
        dutiesRepository: DutiesRepository,
        workRepository: WorkRepository,
        onOpenDuties: @escaping () -> Void,
        onOpenWork: @escaping () -> Void
    ) {
        self.dutiesRepository = dutiesRepository
        self.workRepository = workRepository
        self.onOpenDuties = onOpenDuties
        self.onOpenWork = onOpenWork
        super.init(nibName: nil, bundle: nil)
        title = "Tổng quan"
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    deinit { refreshTask?.cancel() }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemGroupedBackground
        configureView()
        refresh()
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        refresh()
    }

    private func configureView() {
        let scrollView = UIScrollView()
        let stack = UIStackView()
        let subtitle = UILabel()
        let refreshButton = UIButton(type: .system)

        scrollView.translatesAutoresizingMaskIntoConstraints = false
        stack.translatesAutoresizingMaskIntoConstraints = false
        stack.axis = .vertical
        stack.spacing = 16
        stack.isLayoutMarginsRelativeArrangement = true
        stack.directionalLayoutMargins = NSDirectionalEdgeInsets(top: 20, leading: 20, bottom: 28, trailing: 20)

        subtitle.text = "Tóm tắt công việc của bạn"
        subtitle.font = .preferredFont(forTextStyle: .subheadline)
        subtitle.textColor = .secondaryLabel
        subtitle.adjustsFontForContentSizeCategory = true

        refreshButton.setTitle("Làm mới", for: .normal)
        refreshButton.titleLabel?.font = .preferredFont(forTextStyle: .subheadline)
        refreshButton.addAction(UIAction { [weak self] _ in self?.refresh() }, for: .touchUpInside)
        refreshButton.accessibilityLabel = "Làm mới tổng quan"

        let header = UIStackView(arrangedSubviews: [subtitle, UIView(), refreshButton])
        header.alignment = .center
        stack.addArrangedSubview(header)
        stack.addArrangedSubview(dutiesCard)
        stack.addArrangedSubview(workCard)
        stack.addArrangedSubview(statusLabel)
        scrollView.addSubview(stack)
        view.addSubview(scrollView)

        dutiesCard.addAction(UIAction { [weak self] _ in self?.onOpenDuties() }, for: .touchUpInside)
        workCard.addAction(UIAction { [weak self] _ in self?.onOpenWork() }, for: .touchUpInside)

        statusLabel.font = .preferredFont(forTextStyle: .footnote)
        statusLabel.textColor = .secondaryLabel
        statusLabel.numberOfLines = 0
        statusLabel.textAlignment = .center
        statusLabel.adjustsFontForContentSizeCategory = true

        NSLayoutConstraint.activate([
            scrollView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            scrollView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            scrollView.topAnchor.constraint(equalTo: view.topAnchor),
            scrollView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            stack.leadingAnchor.constraint(equalTo: scrollView.contentLayoutGuide.leadingAnchor),
            stack.trailingAnchor.constraint(equalTo: scrollView.contentLayoutGuide.trailingAnchor),
            stack.topAnchor.constraint(equalTo: scrollView.contentLayoutGuide.topAnchor),
            stack.bottomAnchor.constraint(equalTo: scrollView.contentLayoutGuide.bottomAnchor),
            stack.widthAnchor.constraint(equalTo: scrollView.frameLayoutGuide.widthAnchor),
            dutiesCard.heightAnchor.constraint(greaterThanOrEqualToConstant: 150),
            workCard.heightAnchor.constraint(greaterThanOrEqualToConstant: 150),
        ])
    }

    private func refresh() {
        statusLabel.text = "Đang tải dữ liệu…"
        statusLabel.accessibilityLabel = "Đang tải dữ liệu tổng quan"
        dutiesCard.setLoading()
        workCard.setLoading()
        refreshTask?.cancel()
        refreshTask = Task { [weak self] in
            guard let self else { return }
            do {
                async let duties = dutiesRepository.listMine()
                async let work = workRepository.listMine()
                let (dutiesSnapshot, workSnapshot) = try await (duties, work)
                guard !Task.isCancelled else { return }
                dutiesCard.setValues(
                    primaryTitle: "Sắp diễn ra",
                    primaryValue: String(dutiesSnapshot.duties.filter(\.isUpcoming).count),
                    secondaryTitle: "Đang diễn ra",
                    secondaryValue: String(dutiesSnapshot.duties.filter(\.isOngoing).count)
                )
                let pendingApproval = workSnapshot.isAdmin
                    ? workSnapshot.approvals.filter { $0.status == "pending" }.count
                    : workSnapshot.approvals.filter { $0.myDecision.isEmpty }.count
                let pendingExecution = workSnapshot.tasks.filter { WorkHelpers.needsCompletion($0.status) }.count
                    + workSnapshot.completionReviews.count
                workCard.setValues(
                    primaryTitle: "Cần duyệt",
                    primaryValue: String(pendingApproval),
                    secondaryTitle: "Cần thực hiện",
                    secondaryValue: String(pendingExecution)
                )
                statusLabel.text = "Cập nhật theo dữ liệu mới nhất"
                statusLabel.accessibilityLabel = "Tổng quan đã cập nhật"
            } catch is CancellationError {
                return
            } catch {
                dutiesCard.setError()
                workCard.setError()
                statusLabel.text = "Chưa tải được tổng quan. Chạm Làm mới để thử lại."
                statusLabel.accessibilityLabel = "Chưa tải được tổng quan. Chạm Làm mới để thử lại."
            }
        }
    }
}

private final class DashboardCard: UIControl {
    private let titleLabel = UILabel()
    private let iconView = UIImageView()
    private let primaryValueLabel = UILabel()
    private let primaryTitleLabel = UILabel()
    private let secondaryValueLabel = UILabel()
    private let secondaryTitleLabel = UILabel()
    private let arrowView = UIImageView(image: UIImage(systemName: "chevron.right"))
    private let tint: UIColor
    private let contentStack = UIStackView()

    init(title: String, icon: String, tint: UIColor) {
        self.tint = tint
        super.init(frame: .zero)
        backgroundColor = .secondarySystemGroupedBackground
        layer.cornerRadius = 18
        layer.cornerCurve = .continuous
        accessibilityTraits = [.button]
        accessibilityHint = "Mở danh sách \(title.lowercased())"
        configure(title: title, icon: icon)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    override var isHighlighted: Bool {
        didSet { alpha = isHighlighted ? 0.7 : 1.0 }
    }

    func setLoading() {
        primaryValueLabel.text = "—"
        secondaryValueLabel.text = "—"
        primaryTitleLabel.text = "Đang tải"
        secondaryTitleLabel.text = "Đang tải"
        accessibilityValue = "Đang tải"
    }

    func setError() {
        primaryValueLabel.text = "—"
        secondaryValueLabel.text = "—"
        primaryTitleLabel.text = "Chưa tải được"
        secondaryTitleLabel.text = "Chạm để mở"
        accessibilityValue = "Chưa tải được dữ liệu"
    }

    func setValues(primaryTitle: String, primaryValue: String, secondaryTitle: String, secondaryValue: String) {
        primaryValueLabel.text = primaryValue
        primaryTitleLabel.text = primaryTitle
        secondaryValueLabel.text = secondaryValue
        secondaryTitleLabel.text = secondaryTitle
        accessibilityLabel = "\(titleLabel.text ?? "Thẻ")"
        accessibilityValue = "\(primaryTitle) \(primaryValue), \(secondaryTitle) \(secondaryValue)"
    }

    private func configure(title: String, icon: String) {
        titleLabel.text = title
        titleLabel.font = .preferredFont(forTextStyle: .title3)
        titleLabel.adjustsFontForContentSizeCategory = true
        iconView.image = UIImage(systemName: icon)
        iconView.tintColor = tint
        iconView.contentMode = .scaleAspectFit
        arrowView.tintColor = .tertiaryLabel

        let titleRow = UIStackView(arrangedSubviews: [iconView, titleLabel, UIView(), arrowView])
        titleRow.axis = .horizontal
        titleRow.alignment = .center
        titleRow.spacing = 10
        iconView.widthAnchor.constraint(equalToConstant: 28).isActive = true
        iconView.heightAnchor.constraint(equalToConstant: 28).isActive = true
        arrowView.widthAnchor.constraint(equalToConstant: 14).isActive = true

        for label in [primaryValueLabel, secondaryValueLabel] {
            label.font = .preferredFont(forTextStyle: .largeTitle)
            label.adjustsFontForContentSizeCategory = true
            label.textColor = tint
        }
        for label in [primaryTitleLabel, secondaryTitleLabel] {
            label.font = .preferredFont(forTextStyle: .footnote)
            label.textColor = .secondaryLabel
            label.adjustsFontForContentSizeCategory = true
        }

        let primary = UIStackView(arrangedSubviews: [primaryValueLabel, primaryTitleLabel])
        let secondary = UIStackView(arrangedSubviews: [secondaryValueLabel, secondaryTitleLabel])
        primary.alignment = .leading
        secondary.alignment = .leading
        primary.spacing = 2
        secondary.spacing = 2
        let metrics = UIStackView(arrangedSubviews: [primary, secondary])
        metrics.axis = .horizontal
        metrics.distribution = .fillEqually
        metrics.spacing = 12

        contentStack.axis = .vertical
        contentStack.spacing = 16
        contentStack.isLayoutMarginsRelativeArrangement = true
        contentStack.directionalLayoutMargins = NSDirectionalEdgeInsets(top: 18, leading: 18, bottom: 18, trailing: 18)
        contentStack.addArrangedSubview(titleRow)
        contentStack.addArrangedSubview(metrics)
        contentStack.translatesAutoresizingMaskIntoConstraints = false
        addSubview(contentStack)
        NSLayoutConstraint.activate([
            contentStack.leadingAnchor.constraint(equalTo: leadingAnchor),
            contentStack.trailingAnchor.constraint(equalTo: trailingAnchor),
            contentStack.topAnchor.constraint(equalTo: topAnchor),
            contentStack.bottomAnchor.constraint(equalTo: bottomAnchor),
        ])
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
