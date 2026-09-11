import UIKit

@MainActor
final class DutiesHubViewController: UIViewController {
    private let dutiesViewModel: DutiesViewModel
    private let dutiesRepository: DutiesRepository
    private(set) lazy var dutiesListController = DutiesViewController(viewModel: dutiesViewModel)

    init(dutiesViewModel: DutiesViewModel, dutiesRepository: DutiesRepository) {
        self.dutiesViewModel = dutiesViewModel
        self.dutiesRepository = dutiesRepository
        super.init(nibName: nil, bundle: nil)
        title = "Lịch CT"
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemGroupedBackground
        navigationItem.largeTitleDisplayMode = .always

        let personal = hubButton(
            title: "Lịch công tác cá nhân",
            subtitle: "Công tác được giao và công tác bạn tạo",
            systemImage: "person",
            action: #selector(openPersonalFromHub)
        )
        let shared = hubButton(
            title: "Lịch công tác chung",
            subtitle: "Xem và tải PDF lịch toàn trường",
            systemImage: "calendar",
            action: #selector(openSharedFromHub)
        )

        let stack = UIStackView(arrangedSubviews: [personal, shared])
        stack.translatesAutoresizingMaskIntoConstraints = false
        stack.axis = .vertical
        stack.spacing = 16
        view.addSubview(stack)

        NSLayoutConstraint.activate([
            stack.leadingAnchor.constraint(equalTo: view.layoutMarginsGuide.leadingAnchor),
            stack.trailingAnchor.constraint(equalTo: view.layoutMarginsGuide.trailingAnchor),
            stack.centerYAnchor.constraint(equalTo: view.centerYAnchor),
            personal.heightAnchor.constraint(greaterThanOrEqualToConstant: 132),
            shared.heightAnchor.constraint(greaterThanOrEqualToConstant: 132),
        ])
    }

    func openPersonal(animated: Bool) {
        loadViewIfNeeded()
        guard let navigationController else { return }
        if navigationController.viewControllers.contains(dutiesListController) {
            navigationController.popToViewController(dutiesListController, animated: animated)
        } else {
            navigationController.popToRootViewController(animated: false)
            navigationController.pushViewController(dutiesListController, animated: animated)
        }
    }

    @objc private func openPersonalFromHub() {
        openPersonal(animated: !UIAccessibility.isReduceMotionEnabled)
    }

    @objc private func openSharedFromHub() {
        let picker = SharedDutyScheduleViewController(repository: dutiesRepository)
        navigationController?.pushViewController(picker, animated: !UIAccessibility.isReduceMotionEnabled)
    }

    private func hubButton(title: String, subtitle: String, systemImage: String, action: Selector) -> UIButton {
        var configuration = UIButton.Configuration.filled()
        configuration.cornerStyle = .large
        configuration.baseBackgroundColor = .secondarySystemGroupedBackground
        configuration.baseForegroundColor = .label
        configuration.image = UIImage(systemName: systemImage)
        configuration.imagePlacement = .top
        configuration.imagePadding = 10
        configuration.title = title
        configuration.subtitle = subtitle
        configuration.titleAlignment = .center
        configuration.titleTextAttributesTransformer = UIConfigurationTextAttributesTransformer { incoming in
            var outgoing = incoming
            outgoing.font = .preferredFont(forTextStyle: .headline)
            return outgoing
        }
        configuration.subtitleTextAttributesTransformer = UIConfigurationTextAttributesTransformer { incoming in
            var outgoing = incoming
            outgoing.font = .preferredFont(forTextStyle: .footnote)
            outgoing.foregroundColor = .secondaryLabel
            return outgoing
        }
        configuration.contentInsets = NSDirectionalEdgeInsets(top: 22, leading: 16, bottom: 22, trailing: 16)
        let button = UIButton(configuration: configuration)
        button.addTarget(self, action: action, for: .touchUpInside)
        button.accessibilityLabel = title
        button.accessibilityHint = subtitle
        return button
    }
}
