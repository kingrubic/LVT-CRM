import UIKit

enum AppAppearance {
    static let defaultsKey = "lvt_uikit_appearance"

    static var storedStyle: UIUserInterfaceStyle {
        switch UserDefaults.standard.string(forKey: defaultsKey) {
        case "light": return .light
        case "dark": return .dark
        default: return .unspecified
        }
    }

    static func persist(rawValue: String, style: UIUserInterfaceStyle) {
        UserDefaults.standard.set(rawValue, forKey: defaultsKey)
        apply(style)
    }

    static func apply(_ style: UIUserInterfaceStyle) {
        UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap(\.windows)
            .forEach { $0.overrideUserInterfaceStyle = style }
        NotificationCenter.default.post(name: .lvtUserInterfaceStyleDidChange, object: nil)
    }

    static func resolvedTraits(for view: UIView) -> UITraitCollection {
        let window = view.window
        var style = view.traitCollection.userInterfaceStyle
        if let override = window?.overrideUserInterfaceStyle, override != .unspecified {
            style = override
        } else if style == .unspecified {
            style = window?.traitCollection.userInterfaceStyle
                ?? UITraitCollection.current.userInterfaceStyle
        }
        guard style != .unspecified else { return view.traitCollection }
        return UITraitCollection(traitsFrom: [
            view.traitCollection,
            UITraitCollection(userInterfaceStyle: style),
        ])
    }
}

enum AppVersion {
    static var marketing: String {
        let value = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String
        let trimmed = value?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return trimmed.isEmpty ? "0.0.0" : trimmed
    }
}

final class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?
    private var authFlowCoordinator: AuthFlowCoordinator?
    private var destinationObserver: NSObjectProtocol?

    func scene(
        _ scene: UIScene,
        willConnectTo session: UISceneSession,
        options connectionOptions: UIScene.ConnectionOptions
    ) {
        guard let windowScene = scene as? UIWindowScene else { return }

        let window = UIWindow(windowScene: windowScene)
        window.overrideUserInterfaceStyle = AppAppearance.storedStyle
        guard let appDelegate = UIApplication.shared.delegate as? AppDelegate else { return }
        let authFlowCoordinator = AuthFlowCoordinator(window: window, container: appDelegate.container)
        authFlowCoordinator.start()
        destinationObserver = NotificationCenter.default.addObserver(
            forName: .openNotificationDestination,
            object: nil,
            queue: .main
        ) { [weak authFlowCoordinator] notification in
            guard let destination = notification.object as? NotificationDestination else { return }
            Task { @MainActor in authFlowCoordinator?.open(destination) }
        }
        if let response = connectionOptions.notificationResponse,
           let destination = NotificationDestination.from(
               userInfo: response.notification.request.content.userInfo
           ) {
            authFlowCoordinator.open(destination)
        } else if let url = connectionOptions.urlContexts.first?.url,
                  let destination = NotificationDestination.from(url: url) {
            authFlowCoordinator.open(destination)
        } else if let destination = appDelegate.pendingDestination {
            authFlowCoordinator.open(destination)
        }
        window.makeKeyAndVisible()
        self.window = window
        self.authFlowCoordinator = authFlowCoordinator
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        guard let url = URLContexts.first?.url,
              let destination = NotificationDestination.from(url: url) else { return }
        authFlowCoordinator?.open(destination)
    }

    deinit {
        if let destinationObserver {
            NotificationCenter.default.removeObserver(destinationObserver)
        }
    }
}
