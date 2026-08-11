import UIKit

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
        switch UserDefaults.standard.string(forKey: "lvt_uikit_appearance") {
        case "light": window.overrideUserInterfaceStyle = .light
        case "dark": window.overrideUserInterfaceStyle = .dark
        default: window.overrideUserInterfaceStyle = .unspecified
        }
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
