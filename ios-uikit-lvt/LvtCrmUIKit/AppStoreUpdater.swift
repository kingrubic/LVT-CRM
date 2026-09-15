import UIKit

/// Policy for mandatory App Store updates (iOS counterpart to Android Play IMMEDIATE).
enum AppStoreUpdatePolicy {
    /// Force update when the App Store marketing version is strictly newer than local.
    static func shouldForceUpdate(localVersion: String, storeVersion: String) -> Bool {
        compareVersions(storeVersion, localVersion) > 0
    }
}

struct AppStoreLookupResult: Equatable {
    let version: String
    let storeURL: URL
}

/// Fetches the App Store version via iTunes Lookup and presents a non-dismissible blocking UI
/// when an update is required. Fail-open on network/parse errors (retry on next resume).
/// Uses a dedicated overlay `UIWindow` so auth/root swaps cannot dismiss the sheet.
@MainActor
final class AppStoreUpdater {
    static let shared = AppStoreUpdater()

    private let bundleId: String
    private let session: URLSession
    private var isChecking = false
    private var overlayWindow: UIWindow?

    /// UserDefaults key / env var to mock a higher store version (DEBUG + Simulator QA).
    /// Also honored when `LVT_FORCE_UPDATE_MOCK` UserDefaults/env is set, so QA can test
    /// even if a non-DEBUG build is installed by mistake.
    static let debugStoreVersionKey = "lvt_debug_store_version"
    static let forceMockFlagKey = "LVT_FORCE_UPDATE_MOCK"

    init(
        bundleId: String = Bundle.main.bundleIdentifier ?? "vn.lvt.crm.uikit",
        session: URLSession = {
            let config = URLSessionConfiguration.ephemeral
            config.timeoutIntervalForRequest = 12
            config.timeoutIntervalForResource = 15
            config.waitsForConnectivity = false
            return URLSession(configuration: config)
        }()
    ) {
        self.bundleId = bundleId
        self.session = session
    }

    /// Call on launch / each time the scene becomes active (matches Android `onResume`).
    func checkOnResume(window: UIWindow?) {
        guard !isChecking else { return }
        isChecking = true
        Task { @MainActor in
            defer { isChecking = false }
            do {
                let lookup = try await fetchLatest()
                let local = AppVersion.marketing
                guard AppStoreUpdatePolicy.shouldForceUpdate(
                    localVersion: local,
                    storeVersion: lookup.version
                ) else {
                    hideOverlay()
                    return
                }
                showOverlay(storeURL: lookup.storeURL, storeVersion: lookup.version, host: window)
            } catch {
                // Fail-open: do not brick offline users; retry on next resume.
                NSLog("[LvtAppStoreUpdate] check failed (fail-open): %@", String(describing: error))
            }
        }
    }

    // MARK: - Network

    private enum LookupError: Error {
        case badURL
        case emptyResults
        case missingFields
        case badStatus(Int)
    }

    private func fetchLatest() async throws -> AppStoreLookupResult {
        if let override = debugStoreVersionOverride(), !override.isEmpty {
            let fallback = URL(string: "https://apps.apple.com/vn/app/id6802560286")!
            NSLog("[LvtAppStoreUpdate] using mock store version %@", override)
            return AppStoreLookupResult(version: override, storeURL: fallback)
        }

        var components = URLComponents(string: "https://itunes.apple.com/lookup")
        components?.queryItems = [
            URLQueryItem(name: "bundleId", value: bundleId),
            URLQueryItem(name: "country", value: "vn"),
        ]
        guard let url = components?.url else { throw LookupError.badURL }

        let (data, response) = try await session.data(from: url)
        if let http = response as? HTTPURLResponse, !(200...299).contains(http.statusCode) {
            throw LookupError.badStatus(http.statusCode)
        }

        guard
            let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
            let results = json["results"] as? [[String: Any]],
            let first = results.first
        else {
            throw LookupError.emptyResults
        }

        guard
            let version = (first["version"] as? String)?
                .trimmingCharacters(in: .whitespacesAndNewlines),
            !version.isEmpty
        else {
            throw LookupError.missingFields
        }

        let storeURL: URL
        if let trackView = first["trackViewUrl"] as? String,
           let url = URL(string: trackView) {
            storeURL = url
        } else if let trackId = first["trackId"] as? Int,
                  let url = URL(string: "https://apps.apple.com/app/id\(trackId)") {
            storeURL = url
        } else {
            throw LookupError.missingFields
        }

        return AppStoreLookupResult(version: version, storeURL: storeURL)
    }

    private func debugStoreVersionOverride() -> String? {
        if let env = ProcessInfo.processInfo.environment["LVT_DEBUG_STORE_VERSION"],
           !env.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return env.trimmingCharacters(in: .whitespacesAndNewlines)
        }
        if let defaults = UserDefaults.standard.string(forKey: Self.debugStoreVersionKey),
           !defaults.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return defaults.trimmingCharacters(in: .whitespacesAndNewlines)
        }
        return nil
    }

    // MARK: - Overlay window (survives AuthFlow root swaps)

    private func showOverlay(storeURL: URL, storeVersion: String, host: UIWindow?) {
        let scene = host?.windowScene
            ?? UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first
        guard let scene else {
            NSLog("[LvtAppStoreUpdate] no window scene to present overlay")
            return
        }

        if let existing = overlayWindow?.rootViewController as? ForceUpdateViewController {
            existing.update(storeURL: storeURL, storeVersion: storeVersion)
            overlayWindow?.makeKeyAndVisible()
            return
        }

        let vc = ForceUpdateViewController(storeURL: storeURL, storeVersion: storeVersion)
        let overlay = UIWindow(windowScene: scene)
        overlay.windowLevel = .alert + 1
        overlay.rootViewController = vc
        overlay.makeKeyAndVisible()
        overlayWindow = overlay
        NSLog("[LvtAppStoreUpdate] presented force-update overlay for store %@", storeVersion)
    }

    private func hideOverlay() {
        guard overlayWindow != nil else { return }
        overlayWindow?.isHidden = true
        overlayWindow = nil
        // Restore key window to the app's main window if possible.
        UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap(\.windows)
            .first(where: { $0 !== overlayWindow && !$0.isHidden })?
            .makeKeyAndVisible()
    }
}

// MARK: - Blocking UI (Vietnamese, non-dismissible)

@MainActor
final class ForceUpdateViewController: UIViewController {
    private var storeURL: URL
    private var storeVersion: String

    private let titleLabel = UILabel()
    private let messageLabel = UILabel()
    private let versionLabel = UILabel()
    private let updateButton = UIButton(type: .system)

    init(storeURL: URL, storeVersion: String) {
        self.storeURL = storeURL
        self.storeVersion = storeVersion
        super.init(nibName: nil, bundle: nil)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    func update(storeURL: URL, storeVersion: String) {
        self.storeURL = storeURL
        self.storeVersion = storeVersion
        versionLabel.text = "Phiên bản mới: \(storeVersion)  ·  Hiện tại: \(AppVersion.marketing)"
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemBackground
        isModalInPresentation = true

        titleLabel.text = "Cần cập nhật ứng dụng"
        titleLabel.font = .preferredFont(forTextStyle: .title1)
        titleLabel.adjustsFontForContentSizeCategory = true
        titleLabel.textAlignment = .center
        titleLabel.numberOfLines = 0
        titleLabel.textColor = .label
        titleLabel.accessibilityTraits = .header

        messageLabel.text =
            "Đã có phiên bản mới trên App Store. Bạn cần cập nhật để tiếp tục sử dụng LVT CRM."
        messageLabel.font = .preferredFont(forTextStyle: .body)
        messageLabel.adjustsFontForContentSizeCategory = true
        messageLabel.textAlignment = .center
        messageLabel.numberOfLines = 0
        messageLabel.textColor = .secondaryLabel

        versionLabel.font = .preferredFont(forTextStyle: .footnote)
        versionLabel.adjustsFontForContentSizeCategory = true
        versionLabel.textAlignment = .center
        versionLabel.numberOfLines = 0
        versionLabel.textColor = .tertiaryLabel
        versionLabel.text = "Phiên bản mới: \(storeVersion)  ·  Hiện tại: \(AppVersion.marketing)"

        var config = UIButton.Configuration.filled()
        config.title = "Cập nhật trên App Store"
        config.baseBackgroundColor = .systemIndigo
        config.baseForegroundColor = .white
        config.cornerStyle = .large
        config.contentInsets = NSDirectionalEdgeInsets(top: 14, leading: 20, bottom: 14, trailing: 20)
        updateButton.configuration = config
        updateButton.addTarget(self, action: #selector(openAppStore), for: .touchUpInside)
        updateButton.accessibilityLabel = "Cập nhật trên App Store"

        let stack = UIStackView(arrangedSubviews: [titleLabel, messageLabel, versionLabel, updateButton])
        stack.axis = .vertical
        stack.spacing = 16
        stack.alignment = .fill
        stack.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(stack)

        NSLayoutConstraint.activate([
            stack.leadingAnchor.constraint(equalTo: view.layoutMarginsGuide.leadingAnchor),
            stack.trailingAnchor.constraint(equalTo: view.layoutMarginsGuide.trailingAnchor),
            stack.centerYAnchor.constraint(equalTo: view.centerYAnchor),
            updateButton.heightAnchor.constraint(greaterThanOrEqualToConstant: 50),
        ])
    }

    override var prefersHomeIndicatorAutoHidden: Bool { false }

    @objc private func openAppStore() {
        UIApplication.shared.open(storeURL, options: [:], completionHandler: nil)
    }
}
