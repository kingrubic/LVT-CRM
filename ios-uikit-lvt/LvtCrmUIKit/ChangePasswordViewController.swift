import UIKit

@MainActor
final class ChangePasswordViewController: UIViewController, UITextFieldDelegate {
    private let authRepository: AuthRepository
    private let allowsCancel: Bool
    private let onDone: (() -> Void)?
    private let onCancel: (() -> Void)?
    private var isBusy = false
    private var keyboardObservers: [NSObjectProtocol] = []

    private let scrollView = UIScrollView()
    private let stackView = UIStackView()
    private let headingLabel = UILabel()
    private let subtitleLabel = UILabel()
    private let passwordField = UITextField()
    private let confirmField = UITextField()
    private let errorLabel = UILabel()
    private let saveButton = UIButton(type: .system)
    private let activityIndicator = UIActivityIndicatorView(style: .medium)

    init(
        title: String,
        subtitle: String,
        authRepository: AuthRepository,
        allowsCancel: Bool,
        onDone: (() -> Void)? = nil,
        onCancel: (() -> Void)? = nil
    ) {
        self.authRepository = authRepository
        self.allowsCancel = allowsCancel
        self.onDone = onDone
        self.onCancel = onCancel
        super.init(nibName: nil, bundle: nil)
        self.title = title
        headingLabel.text = title
        subtitleLabel.text = subtitle
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemGroupedBackground
        configureViews()
        configureLayout()
        registerForKeyboardChanges()
        updateEnabledState()
    }

    deinit { keyboardObservers.forEach(NotificationCenter.default.removeObserver) }

    private func configureViews() {
        navigationItem.largeTitleDisplayMode = .never
        if allowsCancel {
            navigationItem.leftBarButtonItem = UIBarButtonItem(
                systemItem: .cancel,
                primaryAction: UIAction { [weak self] _ in self?.cancel() }
            )
        } else {
            navigationItem.hidesBackButton = true
        }

        scrollView.keyboardDismissMode = .interactive
        scrollView.translatesAutoresizingMaskIntoConstraints = false
        let tap = UITapGestureRecognizer(target: self, action: #selector(dismissKeyboard))
        tap.cancelsTouchesInView = false
        scrollView.addGestureRecognizer(tap)

        stackView.axis = .vertical
        stackView.spacing = 16
        stackView.translatesAutoresizingMaskIntoConstraints = false

        headingLabel.font = .preferredFont(forTextStyle: .title1)
        headingLabel.adjustsFontForContentSizeCategory = true
        headingLabel.textAlignment = .center
        headingLabel.textColor = .systemIndigo
        headingLabel.numberOfLines = 0
        headingLabel.accessibilityTraits = .header

        subtitleLabel.font = .preferredFont(forTextStyle: .subheadline)
        subtitleLabel.adjustsFontForContentSizeCategory = true
        subtitleLabel.textAlignment = .center
        subtitleLabel.textColor = .secondaryLabel
        subtitleLabel.numberOfLines = 0

        configurePasswordField(passwordField, placeholder: "Mật khẩu mới (ít nhất 8 ký tự)", contentType: .newPassword)
        passwordField.accessibilityLabel = "Mật khẩu mới, ít nhất 8 ký tự"
        passwordField.returnKeyType = .next
        configurePasswordField(confirmField, placeholder: "Nhập lại mật khẩu", contentType: .newPassword)
        confirmField.accessibilityLabel = "Nhập lại mật khẩu mới"
        confirmField.returnKeyType = .done

        errorLabel.font = .preferredFont(forTextStyle: .footnote)
        errorLabel.adjustsFontForContentSizeCategory = true
        errorLabel.textColor = .systemRed
        errorLabel.numberOfLines = 0
        errorLabel.isHidden = true

        var configuration = UIButton.Configuration.filled()
        configuration.title = "Lưu mật khẩu"
        configuration.baseBackgroundColor = .systemIndigo
        configuration.cornerStyle = .large
        saveButton.configuration = configuration
        saveButton.titleLabel?.font = .preferredFont(forTextStyle: .headline)
        saveButton.titleLabel?.adjustsFontForContentSizeCategory = true
        saveButton.addTarget(self, action: #selector(save), for: .touchUpInside)
        saveButton.accessibilityHint = "Đổi mật khẩu trên máy chủ"
        saveButton.translatesAutoresizingMaskIntoConstraints = false

        let saveRow = UIView()
        saveRow.translatesAutoresizingMaskIntoConstraints = false
        activityIndicator.translatesAutoresizingMaskIntoConstraints = false
        activityIndicator.color = .white
        saveRow.addSubview(saveButton)
        saveRow.addSubview(activityIndicator)
        NSLayoutConstraint.activate([
            saveButton.leadingAnchor.constraint(equalTo: saveRow.leadingAnchor),
            saveButton.trailingAnchor.constraint(equalTo: saveRow.trailingAnchor),
            saveButton.topAnchor.constraint(equalTo: saveRow.topAnchor),
            saveButton.bottomAnchor.constraint(equalTo: saveRow.bottomAnchor),
            activityIndicator.leadingAnchor.constraint(equalTo: saveButton.leadingAnchor, constant: 16),
            activityIndicator.centerYAnchor.constraint(equalTo: saveButton.centerYAnchor),
        ])

        [headingLabel, subtitleLabel, passwordField, confirmField, errorLabel, saveRow]
            .forEach(stackView.addArrangedSubview)
        stackView.setCustomSpacing(28, after: subtitleLabel)
    }

    private func configurePasswordField(
        _ field: UITextField,
        placeholder: String,
        contentType: UITextContentType
    ) {
        field.placeholder = placeholder
        field.font = .preferredFont(forTextStyle: .body)
        field.adjustsFontForContentSizeCategory = true
        field.borderStyle = .roundedRect
        field.isSecureTextEntry = true
        field.textContentType = contentType
        field.autocapitalizationType = .none
        field.autocorrectionType = .no
        field.delegate = self
        field.addTarget(self, action: #selector(textDidChange), for: .editingChanged)
        field.translatesAutoresizingMaskIntoConstraints = false
    }

    private func configureLayout() {
        view.addSubview(scrollView)
        scrollView.addSubview(stackView)
        let frameGuide = scrollView.frameLayoutGuide
        let contentGuide = scrollView.contentLayoutGuide
        NSLayoutConstraint.activate([
            scrollView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            scrollView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            scrollView.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            scrollView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            stackView.topAnchor.constraint(equalTo: contentGuide.topAnchor, constant: 40),
            stackView.bottomAnchor.constraint(equalTo: contentGuide.bottomAnchor, constant: -32),
            stackView.centerXAnchor.constraint(equalTo: frameGuide.centerXAnchor),
            stackView.leadingAnchor.constraint(greaterThanOrEqualTo: frameGuide.leadingAnchor, constant: 24),
            stackView.trailingAnchor.constraint(lessThanOrEqualTo: frameGuide.trailingAnchor, constant: -24),
            stackView.widthAnchor.constraint(equalTo: frameGuide.widthAnchor, constant: -48),
            stackView.widthAnchor.constraint(lessThanOrEqualToConstant: 480),
            passwordField.heightAnchor.constraint(greaterThanOrEqualToConstant: 52),
            confirmField.heightAnchor.constraint(greaterThanOrEqualToConstant: 52),
            saveButton.heightAnchor.constraint(greaterThanOrEqualToConstant: 50),
        ])
    }

    @objc private func textDidChange() {
        clearError()
        updateEnabledState()
    }

    private func updateEnabledState() {
        let hasPassword = !(passwordField.text ?? "").isEmpty
        let hasConfirmation = !(confirmField.text ?? "").isEmpty
        saveButton.isEnabled = !isBusy && hasPassword && hasConfirmation
        passwordField.isEnabled = !isBusy
        confirmField.isEnabled = !isBusy
        navigationItem.leftBarButtonItem?.isEnabled = !isBusy
    }

    @objc private func save() {
        let password = passwordField.text ?? ""
        guard password.count >= 8 else {
            showError(ConvexHttpClient.humanize("PASSWORD_TOO_SHORT"))
            return
        }
        guard password == confirmField.text else {
            showError("Mật khẩu nhập lại không khớp.")
            return
        }
        view.endEditing(true)
        setBusy(true)
        clearError()
        Task { [weak self] in
            guard let self else { return }
            let result = await authRepository.changePassword(newPassword: password)
            setBusy(false)
            switch result {
            case .success: onDone?()
            case .failure(let error):
                showError((error as? ConvexException)?.message ?? ConvexHttpClient.humanize(error.localizedDescription))
            }
        }
    }

    private func setBusy(_ busy: Bool) {
        isBusy = busy
        busy ? activityIndicator.startAnimating() : activityIndicator.stopAnimating()
        saveButton.accessibilityLabel = busy ? "Đang lưu mật khẩu" : nil
        updateEnabledState()
    }

    private func showError(_ message: String) {
        errorLabel.text = message
        errorLabel.isHidden = false
        UIAccessibility.post(notification: .announcement, argument: message)
    }

    private func clearError() {
        errorLabel.text = nil
        errorLabel.isHidden = true
    }

    private func cancel() {
        if let onCancel { onCancel() } else { navigationController?.popViewController(animated: true) }
    }

    func textFieldShouldReturn(_ textField: UITextField) -> Bool {
        if textField === passwordField { confirmField.becomeFirstResponder() }
        else if saveButton.isEnabled { save() }
        return true
    }

    @objc private func dismissKeyboard() { view.endEditing(true) }

    private func registerForKeyboardChanges() {
        let center = NotificationCenter.default
        keyboardObservers = [
            center.addObserver(forName: UIResponder.keyboardWillChangeFrameNotification, object: nil, queue: .main) {
                [weak self] note in
                MainActor.assumeIsolated { self?.updateKeyboardInset(note) }
            },
            center.addObserver(forName: UIResponder.keyboardWillHideNotification, object: nil, queue: .main) {
                [weak self] _ in
                MainActor.assumeIsolated {
                    self?.scrollView.contentInset.bottom = 0
                    self?.scrollView.verticalScrollIndicatorInsets.bottom = 0
                }
            },
        ]
    }

    private func updateKeyboardInset(_ notification: Notification) {
        guard let frame = notification.userInfo?[UIResponder.keyboardFrameEndUserInfoKey] as? CGRect else { return }
        let height = max(0, view.bounds.maxY - view.convert(frame, from: nil).minY)
        scrollView.contentInset.bottom = height
        scrollView.verticalScrollIndicatorInsets.bottom = height
    }
}
