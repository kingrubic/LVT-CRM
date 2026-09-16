import UIKit

func accountInitials(name: String, email: String) -> String {
    let words = name.trimmingCharacters(in: .whitespacesAndNewlines)
        .split(whereSeparator: \.isWhitespace)
        .map(String.init)
        .filter { !$0.isEmpty }
    let fromName: String
    if words.count >= 2, let first = words.first?.first, let last = words.last?.first {
        fromName = String([first, last])
    } else if let word = words.first {
        fromName = String(word.prefix(2))
    } else {
        fromName = ""
    }
    let trimmed = fromName.uppercased()
    if !trimmed.isEmpty { return String(trimmed.prefix(2)) }
    if let character = email.trimmingCharacters(in: .whitespacesAndNewlines).first {
        return String(character).uppercased()
    }
    return "L"
}

func unreadBadgeText(_ count: Int) -> String? {
    if count <= 0 { return nil }
    return count > 99 ? "99+" : "\(count)"
}

/// AirVisual-style trailing control: bell + circular initials in a compact pill.
final class AccountHeaderClusterView: UIView {
    var onBell: (() -> Void)?
    var onAvatar: (() -> Void)?
    var unreadCount: Int = 0 {
        didSet { updateBadge() }
    }

    private let pill = UIView()
    private let bellButton = UIButton(type: .system)
    private let avatarButton = UIButton(type: .system)
    private let avatarImageView = UIImageView()
    private let badgeLabel = UILabel()
    private let initials: String

    init(initials: String, unreadCount: Int = 0) {
        self.initials = initials
        super.init(frame: CGRect(x: 0, y: 0, width: 92, height: 36))
        configure(initials: initials)
        self.unreadCount = unreadCount
        updateBadge()
        applyAppearance()
        registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (view: AccountHeaderClusterView, _) in
            view.applyAppearance()
        }
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    override var intrinsicContentSize: CGSize { CGSize(width: 92, height: 36) }

    private func configure(initials: String) {
        pill.translatesAutoresizingMaskIntoConstraints = false
        pill.layer.cornerRadius = 18
        pill.layer.cornerCurve = .continuous
        addSubview(pill)

        var bellConfiguration = UIButton.Configuration.plain()
        bellConfiguration.image = UIImage(systemName: "bell")
        bellConfiguration.preferredSymbolConfigurationForImage = UIImage.SymbolConfiguration(pointSize: 15, weight: .medium)
        bellConfiguration.contentInsets = NSDirectionalEdgeInsets(top: 6, leading: 8, bottom: 6, trailing: 6)
        bellButton.configuration = bellConfiguration
        bellButton.accessibilityLabel = "Thông báo"
        bellButton.addAction(UIAction { [weak self] _ in self?.onBell?() }, for: .touchUpInside)

        avatarButton.translatesAutoresizingMaskIntoConstraints = false
        avatarButton.layer.cornerRadius = 14
        avatarButton.layer.cornerCurve = .continuous
        avatarButton.clipsToBounds = true
        avatarButton.setTitle(initials, for: .normal)
        avatarButton.titleLabel?.font = .systemFont(ofSize: 12, weight: .semibold)
        avatarButton.accessibilityLabel = "Cá nhân"
        avatarButton.addAction(UIAction { [weak self] _ in self?.onAvatar?() }, for: .touchUpInside)

        avatarImageView.translatesAutoresizingMaskIntoConstraints = false
        avatarImageView.contentMode = .scaleAspectFill
        avatarImageView.clipsToBounds = true
        avatarImageView.isUserInteractionEnabled = false
        avatarImageView.isHidden = true
        avatarButton.addSubview(avatarImageView)

        badgeLabel.translatesAutoresizingMaskIntoConstraints = false
        badgeLabel.font = .systemFont(ofSize: 9, weight: .bold)
        badgeLabel.textColor = .white
        badgeLabel.textAlignment = .center
        badgeLabel.backgroundColor = .systemRed
        badgeLabel.layer.cornerRadius = 8
        badgeLabel.layer.cornerCurve = .continuous
        badgeLabel.clipsToBounds = true
        badgeLabel.isHidden = true
        badgeLabel.isAccessibilityElement = false

        let stack = UIStackView(arrangedSubviews: [bellButton, avatarButton])
        stack.translatesAutoresizingMaskIntoConstraints = false
        stack.axis = .horizontal
        stack.alignment = .center
        stack.spacing = 2
        pill.addSubview(stack)
        addSubview(badgeLabel)

        NSLayoutConstraint.activate([
            pill.leadingAnchor.constraint(equalTo: leadingAnchor),
            pill.trailingAnchor.constraint(equalTo: trailingAnchor),
            pill.topAnchor.constraint(equalTo: topAnchor),
            pill.bottomAnchor.constraint(equalTo: bottomAnchor),
            stack.leadingAnchor.constraint(equalTo: pill.leadingAnchor, constant: 2),
            stack.trailingAnchor.constraint(equalTo: pill.trailingAnchor, constant: -4),
            stack.topAnchor.constraint(equalTo: pill.topAnchor),
            stack.bottomAnchor.constraint(equalTo: pill.bottomAnchor),
            avatarButton.widthAnchor.constraint(equalToConstant: 28),
            avatarButton.heightAnchor.constraint(equalToConstant: 28),
            avatarImageView.leadingAnchor.constraint(equalTo: avatarButton.leadingAnchor),
            avatarImageView.trailingAnchor.constraint(equalTo: avatarButton.trailingAnchor),
            avatarImageView.topAnchor.constraint(equalTo: avatarButton.topAnchor),
            avatarImageView.bottomAnchor.constraint(equalTo: avatarButton.bottomAnchor),
            badgeLabel.topAnchor.constraint(equalTo: bellButton.topAnchor, constant: 1),
            badgeLabel.trailingAnchor.constraint(equalTo: bellButton.trailingAnchor, constant: 2),
            badgeLabel.widthAnchor.constraint(greaterThanOrEqualToConstant: 16),
            badgeLabel.heightAnchor.constraint(equalToConstant: 16),
        ])
        isAccessibilityElement = false
    }

    private func updateBadge() {
        let text = unreadBadgeText(unreadCount)
        badgeLabel.text = text
        badgeLabel.isHidden = text == nil
        if let text {
            bellButton.accessibilityValue = text == "99+" ? "Hơn 99 chưa đọc" : "\(unreadCount) chưa đọc"
        } else {
            bellButton.accessibilityValue = "Không có thông báo chưa đọc"
        }
    }

    private func applyAppearance() {
        let dark = traitCollection.userInterfaceStyle == .dark
        pill.backgroundColor = dark
            ? UIColor.white.withAlphaComponent(0.12)
            : UIColor.black.withAlphaComponent(0.06)
        bellButton.tintColor = dark ? UIColor.white.withAlphaComponent(0.92) : UIColor.label
        avatarButton.backgroundColor = .systemIndigo
        avatarButton.setTitleColor(.white, for: .normal)
    }

    func setAvatarImage(_ image: UIImage?) {
        avatarImageView.image = image
        avatarImageView.isHidden = image == nil
        avatarButton.setTitle(image == nil ? initials : nil, for: .normal)
    }
}
