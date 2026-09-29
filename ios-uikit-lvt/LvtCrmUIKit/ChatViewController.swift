import UIKit

@MainActor
final class ChatViewController: UIViewController, UITableViewDataSource, UITableViewDelegate, UITextViewDelegate {
    private let repository: ChatRepository
    private let target: ChatTarget
    private var threadTitle: String
    private var messages: [ChatMessage] = []
    private var loading = true
    private var sending = false
    private var recallingId: String?
    private var errorMessage: String?
    private var pollTask: Task<Void, Never>?
    private var recallTask: Task<Void, Never>?
    var hubActions = false
    var onOpenEntity: (() -> Void)?
    var onManageGroup: (() -> Void)?
    var onArchive: (() -> Void)?
    private var canSend = true
    private var composerStack: UIStackView?
    private let viewerNote = UILabel()
    private let archiveButton = UIButton(type: .system)

    private let tableView = UITableView(frame: .zero, style: .plain)
    private let composer = UITextView()
    private let placeholder = UILabel()
    private let sendButton = UIButton(type: .system)
    private let errorLabel = UILabel()
    private let boldButton = UIButton(type: .system)
    private let italicButton = UIButton(type: .system)
    private let underlineButton = UIButton(type: .system)
    private var composerBottom: NSLayoutConstraint?

    init(repository: ChatRepository, target: ChatTarget) {
        self.repository = repository
        self.target = target
        threadTitle = target.title.isEmpty ? "Trao đổi" : target.title
        super.init(nibName: nil, bundle: nil)
        title = "Trao đổi"
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemBackground
        navigationItem.largeTitleDisplayMode = .never
        tableView.translatesAutoresizingMaskIntoConstraints = false
        tableView.dataSource = self
        tableView.delegate = self
        tableView.separatorStyle = .none
        tableView.keyboardDismissMode = .interactive
        tableView.register(ChatMessageCell.self, forCellReuseIdentifier: ChatMessageCell.reuseId)
        tableView.rowHeight = UITableView.automaticDimension
        tableView.estimatedRowHeight = 88
        tableView.tableHeaderView = header()

        let toolbar = UIStackView(arrangedSubviews: [boldButton, italicButton, underlineButton])
        toolbar.axis = .horizontal
        toolbar.spacing = 8
        configureStyleButton(boldButton, title: "B", label: "In đậm", trait: .traitBold)
        configureStyleButton(italicButton, title: "I", label: "In nghiêng", trait: .traitItalic)
        configureStyleButton(underlineButton, title: "U", label: "Gạch chân", underline: true)

        composer.font = .preferredFont(forTextStyle: .body)
        composer.adjustsFontForContentSizeCategory = true
        composer.isScrollEnabled = true
        composer.layer.cornerRadius = 12
        composer.backgroundColor = .secondarySystemBackground
        composer.textContainerInset = UIEdgeInsets(top: 10, left: 8, bottom: 10, right: 8)
        composer.delegate = self
        composer.accessibilityLabel = "Nội dung tin nhắn"
        composer.heightAnchor.constraint(greaterThanOrEqualToConstant: 72).isActive = true
        composer.heightAnchor.constraint(lessThanOrEqualToConstant: 140).isActive = true

        placeholder.text = "Nhập tin nhắn…"
        placeholder.textColor = .secondaryLabel
        placeholder.font = .preferredFont(forTextStyle: .body)
        placeholder.translatesAutoresizingMaskIntoConstraints = false
        composer.addSubview(placeholder)
        NSLayoutConstraint.activate([
            placeholder.leadingAnchor.constraint(equalTo: composer.leadingAnchor, constant: 14),
            placeholder.topAnchor.constraint(equalTo: composer.topAnchor, constant: 10),
        ])

        sendButton.configuration = .filled()
        sendButton.configuration?.title = "Gửi"
        sendButton.addAction(UIAction { [weak self] _ in self?.send() }, for: .touchUpInside)
        sendButton.isEnabled = false

        errorLabel.font = .preferredFont(forTextStyle: .footnote)
        errorLabel.textColor = .systemRed
        errorLabel.numberOfLines = 0
        errorLabel.isHidden = true

        let composerStack = UIStackView(arrangedSubviews: [toolbar, composer, errorLabel, sendButton])
        composerStack.axis = .vertical
        composerStack.spacing = 8
        composerStack.isLayoutMarginsRelativeArrangement = true
        composerStack.layoutMargins = UIEdgeInsets(top: 8, left: 16, bottom: 8, right: 16)
        self.composerStack = composerStack

        viewerNote.text = "Bạn đang xem nhóm này. Chỉ thành viên mới gửi tin."
        viewerNote.font = .preferredFont(forTextStyle: .footnote)
        viewerNote.textColor = .secondaryLabel
        viewerNote.numberOfLines = 0
        viewerNote.isHidden = true

        archiveButton.configuration = .plain()
        archiveButton.configuration?.title = "Ẩn cuộc trò chuyện"
        archiveButton.addAction(UIAction { [weak self] _ in self?.onArchive?() }, for: .touchUpInside)
        archiveButton.isHidden = true

        let footer = UIStackView(arrangedSubviews: [composerStack, viewerNote, archiveButton])
        footer.axis = .vertical
        footer.spacing = 8
        footer.translatesAutoresizingMaskIntoConstraints = false
        footer.isLayoutMarginsRelativeArrangement = true
        footer.layoutMargins = UIEdgeInsets(top: 0, left: 16, bottom: 8, right: 16)
        composerStack.layoutMargins = UIEdgeInsets(top: 8, left: 0, bottom: 0, right: 0)

        view.addSubview(tableView)
        view.addSubview(footer)
        let bottom = footer.bottomAnchor.constraint(equalTo: view.keyboardLayoutGuide.topAnchor)
        composerBottom = bottom
        NSLayoutConstraint.activate([
            tableView.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            tableView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            tableView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            tableView.bottomAnchor.constraint(equalTo: footer.topAnchor),
            footer.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            footer.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            bottom,
        ])
        updateSendEnabled()
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        pollTask?.cancel()
        pollTask = Task { [weak self] in
            while !Task.isCancelled {
                await self?.reload()
                try? await Task.sleep(nanoseconds: 8_000_000_000)
            }
        }
    }

    override func viewDidDisappear(_ animated: Bool) {
        super.viewDidDisappear(animated)
        pollTask?.cancel()
        recallTask?.cancel()
    }

    func tableView(_ tableView: UITableView, numberOfRowsInSection section: Int) -> Int {
        messages.isEmpty ? 1 : messages.count
    }

    func tableView(_ tableView: UITableView, cellForRowAt indexPath: IndexPath) -> UITableViewCell {
        if messages.isEmpty {
            let cell = UITableViewCell(style: .subtitle, reuseIdentifier: nil)
            cell.selectionStyle = .none
            var content = cell.defaultContentConfiguration()
            if loading {
                content.text = "Đang tải tin nhắn…"
            } else if let errorMessage {
                content.text = errorMessage
                content.textProperties.color = .systemRed
            } else {
                content.text = "Chưa có tin nhắn. Hãy bắt đầu trao đổi."
            }
            content.textProperties.numberOfLines = 0
            cell.contentConfiguration = content
            return cell
        }
        let message = messages[indexPath.row]
        let cell = tableView.dequeueReusableCell(withIdentifier: ChatMessageCell.reuseId, for: indexPath) as! ChatMessageCell
        let now = Int64(Date().timeIntervalSince1970 * 1000)
        let recallVisible = message.isSelf && message.canRecall &&
            chatRecallStillOpen(createdAt: message.createdAt, recalled: message.recalled, now: now)
        cell.configure(message: message, recallVisible: recallVisible, recalling: recallingId == message.id) { [weak self] in
            self?.recall(message)
        }
        return cell
    }

    private func header() -> UIView {
        let titleLabel = UILabel()
        titleLabel.text = threadTitle
        titleLabel.font = .preferredFont(forTextStyle: .title2)
        titleLabel.numberOfLines = 0
        let context = UILabel()
        context.text = chatContextText(target.kind)
        context.font = .preferredFont(forTextStyle: .footnote)
        context.textColor = .secondaryLabel
        context.numberOfLines = 0
        let stack = UIStackView(arrangedSubviews: [titleLabel, context])
        stack.axis = .vertical
        stack.spacing = 4
        stack.translatesAutoresizingMaskIntoConstraints = false
        let container = UIView(frame: CGRect(x: 0, y: 0, width: view.bounds.width, height: 72))
        container.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.leadingAnchor.constraint(equalTo: container.leadingAnchor, constant: 16),
            stack.trailingAnchor.constraint(equalTo: container.trailingAnchor, constant: -16),
            stack.topAnchor.constraint(equalTo: container.topAnchor, constant: 8),
            stack.bottomAnchor.constraint(equalTo: container.bottomAnchor, constant: -8),
        ])
        return container
    }

    private func reload() async {
        do {
            let thread = try await repository.list(target)
            if !thread.title.isEmpty { threadTitle = thread.title }
            messages = thread.messages
            errorMessage = nil
            loading = false
            refreshHeader()
            let wasNearBottom = isNearBottom()
            tableView.reloadData()
            if wasNearBottom { scrollToBottom() }
            scheduleRecallRefresh()
            await refreshHubChrome()
            updateArchiveButton()
        } catch {
            loading = false
            if messages.isEmpty {
                errorMessage = chatError(error, action: .load)
                tableView.reloadData()
            }
            updateArchiveButton()
        }
    }

    private func refreshHubChrome() async {
        guard hubActions else { return }
        try? await repository.markRead(threadKey: chatThreadKey(target.kind, target.entityId))
        if target.kind == .group {
            let state = try? await repository.groupState(groupId: target.entityId)
            canSend = state?.canSend ?? true
            let count = state?.memberCount ?? 0
            let label = count > 0 ? "\(count) thành viên" : "Thành viên"
            navigationItem.rightBarButtonItem = UIBarButtonItem(
                title: label,
                style: .plain,
                target: self,
                action: #selector(hubActionTapped)
            )
        } else {
            let label = target.kind == .duty ? "Mở công tác" : "Mở công việc"
            navigationItem.rightBarButtonItem = UIBarButtonItem(
                title: label,
                style: .plain,
                target: self,
                action: #selector(hubActionTapped)
            )
        }
        composerStack?.isHidden = !canSend
        viewerNote.isHidden = canSend
    }

    @objc private func hubActionTapped() {
        if target.kind == .group {
            onManageGroup?()
        } else {
            onOpenEntity?()
        }
    }

    private func updateArchiveButton() {
        archiveButton.isHidden = !(hubActions && errorMessage != nil && messages.isEmpty && !loading)
    }

    private func send() {
        let plain = composer.text.replacingOccurrences(of: "\u{00a0}", with: " ").trimmingCharacters(in: .whitespacesAndNewlines)
        guard !plain.isEmpty, !sending else { return }
        if plain.count > chatTextMaxLength {
            showError(chatFailureMessage("CHAT_TOO_LONG", action: .send))
            return
        }
        let html = chatAttributedHtml(composer.attributedText ?? NSAttributedString(string: composer.text ?? ""))
        sending = true
        updateSendEnabled()
        showError(nil)
        Task { [weak self] in
            guard let self else { return }
            do {
                try await repository.send(target, bodyHtml: html)
                composer.attributedText = NSAttributedString(string: "")
                textViewDidChange(composer)
                await reload()
            } catch {
                showError(chatError(error, action: .send))
            }
            sending = false
            updateSendEnabled()
        }
    }

    private func recall(_ message: ChatMessage) {
        guard recallingId == nil else { return }
        recallingId = message.id
        showError(nil)
        tableView.reloadData()
        Task { [weak self] in
            guard let self else { return }
            do {
                try await repository.recall(target, messageId: message.id)
                await reload()
            } catch {
                showError(chatError(error, action: .recall))
            }
            recallingId = nil
            tableView.reloadData()
        }
    }

    private func scheduleRecallRefresh() {
        recallTask?.cancel()
        let deadline = messages
            .filter { $0.isSelf && !$0.recalled && $0.canRecall }
            .map { $0.createdAt + chatRecallWindowMs }
            .min()
        guard let deadline else { return }
        let wait = deadline - Int64(Date().timeIntervalSince1970 * 1000)
        guard wait > 0 else { return }
        recallTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: UInt64(wait) * 1_000_000)
            self?.tableView.reloadData()
        }
    }

    private func configureStyleButton(
        _ button: UIButton,
        title: String,
        label: String,
        trait: UIFontDescriptor.SymbolicTraits? = nil,
        underline: Bool = false
    ) {
        button.configuration = .bordered()
        button.configuration?.title = title
        button.accessibilityLabel = label
        button.addAction(UIAction { [weak self] _ in
            self?.toggleStyle(trait: trait, underline: underline)
        }, for: .touchUpInside)
    }

    private func toggleStyle(trait: UIFontDescriptor.SymbolicTraits?, underline: Bool) {
        composer.becomeFirstResponder()
        let range = composer.selectedRange
        if range.length == 0 {
            var typing = composer.typingAttributes
            if let trait {
                let font = (typing[.font] as? UIFont) ?? UIFont.preferredFont(forTextStyle: .body)
                typing[.font] = font.chatToggling(trait)
            }
            if underline {
                let current = typing[.underlineStyle] as? Int ?? 0
                typing[.underlineStyle] = current == 0 ? NSUnderlineStyle.single.rawValue : 0
            }
            composer.typingAttributes = typing
            return
        }
        let mutable = NSMutableAttributedString(attributedString: composer.attributedText)
        mutable.enumerateAttributes(in: range) { attributes, subrange, _ in
            var next = attributes
            if let trait {
                let font = (attributes[.font] as? UIFont) ?? UIFont.preferredFont(forTextStyle: .body)
                next[.font] = font.chatToggling(trait)
            }
            if underline {
                let current = attributes[.underlineStyle] as? Int ?? 0
                next[.underlineStyle] = current == 0 ? NSUnderlineStyle.single.rawValue : 0
            }
            mutable.setAttributes(next, range: subrange)
        }
        composer.attributedText = mutable
        composer.selectedRange = range
        textViewDidChange(composer)
    }

    func textViewDidChange(_ textView: UITextView) {
        placeholder.isHidden = !textView.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        updateSendEnabled()
    }

    private func updateSendEnabled() {
        let empty = composer.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        sendButton.isEnabled = !sending && !empty && !(loading && messages.isEmpty)
        sendButton.configuration?.title = sending ? "Đang gửi…" : "Gửi"
    }

    private func showError(_ message: String?) {
        errorMessage = message
        errorLabel.text = message
        errorLabel.isHidden = message == nil
    }

    private func refreshHeader() {
        tableView.tableHeaderView = header()
        guard let headerView = tableView.tableHeaderView else { return }
        let width = tableView.bounds.width
        headerView.frame.size.width = width
        headerView.setNeedsLayout()
        headerView.layoutIfNeeded()
        let height = headerView.systemLayoutSizeFitting(
            CGSize(width: width, height: 0),
            withHorizontalFittingPriority: .required,
            verticalFittingPriority: .fittingSizeLevel
        ).height
        headerView.frame.size.height = height
        tableView.tableHeaderView = headerView
    }

    private func isNearBottom() -> Bool {
        let visible = tableView.contentOffset.y + tableView.bounds.height
        return visible >= tableView.contentSize.height - 120
    }

    private func scrollToBottom() {
        guard messages.count > 0 else { return }
        tableView.scrollToRow(at: IndexPath(row: messages.count - 1, section: 0), at: .bottom, animated: false)
    }

    private func chatError(_ error: Error, action: ChatAction) -> String {
        if let convex = error as? ConvexException {
            return chatFailureMessage("\(convex.code) \(convex.message)", action: action)
        }
        return chatFailureMessage(error.localizedDescription, action: action)
    }
}

private extension UIFont {
    func chatToggling(_ trait: UIFontDescriptor.SymbolicTraits) -> UIFont {
        var traits = fontDescriptor.symbolicTraits
        if traits.contains(trait) {
            traits.remove(trait)
        } else {
            traits.insert(trait)
        }
        guard let descriptor = fontDescriptor.withSymbolicTraits(traits) else { return self }
        return UIFont(descriptor: descriptor, size: pointSize)
    }
}

private final class ChatMessageCell: UITableViewCell {
    static let reuseId = "ChatMessageCell"
    private let initials = UILabel()
    private let nameLabel = UILabel()
    private let timeLabel = UILabel()
    private let bodyLabel = UILabel()
    private let recallButton = UIButton(type: .system)
    private let textStack = UIStackView()
    private var onRecall: (() -> Void)?
    private var avatarLeading: NSLayoutConstraint!
    private var avatarTrailing: NSLayoutConstraint!
    private var bubbleLeading: NSLayoutConstraint!
    private var bubbleTrailing: NSLayoutConstraint!

    override init(style: UITableViewCell.CellStyle, reuseIdentifier: String?) {
        super.init(style: style, reuseIdentifier: reuseIdentifier)
        selectionStyle = .none
        backgroundColor = .clear
        initials.font = .preferredFont(forTextStyle: .caption1)
        initials.textAlignment = .center
        initials.backgroundColor = .systemIndigo.withAlphaComponent(0.15)
        initials.layer.cornerRadius = 18
        initials.clipsToBounds = true
        initials.translatesAutoresizingMaskIntoConstraints = false
        nameLabel.font = UIFont.preferredFont(forTextStyle: .subheadline).bold()
        timeLabel.font = .preferredFont(forTextStyle: .caption2)
        timeLabel.textColor = .secondaryLabel
        bodyLabel.numberOfLines = 0
        recallButton.configuration = .plain()
        recallButton.addAction(UIAction { [weak self] _ in self?.onRecall?() }, for: .touchUpInside)
        textStack.addArrangedSubview(nameLabel)
        textStack.addArrangedSubview(timeLabel)
        textStack.addArrangedSubview(bodyLabel)
        textStack.addArrangedSubview(recallButton)
        textStack.axis = .vertical
        textStack.alignment = .leading
        textStack.spacing = 2
        textStack.translatesAutoresizingMaskIntoConstraints = false
        contentView.addSubview(initials)
        contentView.addSubview(textStack)
        avatarLeading = initials.leadingAnchor.constraint(equalTo: contentView.leadingAnchor, constant: 16)
        avatarTrailing = initials.trailingAnchor.constraint(equalTo: contentView.trailingAnchor, constant: -16)
        bubbleLeading = textStack.leadingAnchor.constraint(equalTo: contentView.leadingAnchor, constant: 60)
        bubbleTrailing = textStack.trailingAnchor.constraint(equalTo: contentView.trailingAnchor, constant: -60)
        NSLayoutConstraint.activate([
            initials.widthAnchor.constraint(equalToConstant: 36),
            initials.heightAnchor.constraint(equalToConstant: 36),
            initials.topAnchor.constraint(equalTo: contentView.topAnchor, constant: 8),
            textStack.topAnchor.constraint(equalTo: contentView.topAnchor, constant: 8),
            textStack.bottomAnchor.constraint(equalTo: contentView.bottomAnchor, constant: -8),
            textStack.widthAnchor.constraint(lessThanOrEqualTo: contentView.widthAnchor, multiplier: 0.78),
        ])
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    func configure(message: ChatMessage, recallVisible: Bool, recalling: Bool, onRecall: @escaping () -> Void) {
        self.onRecall = onRecall
        initials.text = message.authorInitials
        nameLabel.text = message.authorName
        timeLabel.text = formatChatTime(message.createdAt)
        if message.recalled {
            bodyLabel.attributedText = nil
            bodyLabel.text = chatRecalledPlaceholder
            bodyLabel.font = .italicSystemFont(ofSize: UIFont.preferredFont(forTextStyle: .body).pointSize)
            bodyLabel.textColor = .secondaryLabel
        } else {
            bodyLabel.text = nil
            bodyLabel.attributedText = chatRunsToAttributed(chatHtmlToRuns(message.bodyHtml))
            bodyLabel.textColor = .label
        }
        recallButton.isHidden = !recallVisible
        recallButton.configuration?.title = recalling ? "Đang thu hồi…" : "Thu hồi"
        recallButton.isEnabled = !recalling
        recallButton.accessibilityLabel = "Thu hồi tin nhắn"
        avatarLeading.isActive = false
        avatarTrailing.isActive = false
        bubbleLeading.isActive = false
        bubbleTrailing.isActive = false
        if message.isSelf {
            avatarTrailing.isActive = true
            bubbleTrailing.isActive = true
            textStack.alignment = .trailing
        } else {
            avatarLeading.isActive = true
            bubbleLeading.isActive = true
            textStack.alignment = .leading
        }
    }

    override func prepareForReuse() {
        super.prepareForReuse()
        onRecall = nil
    }
}

private extension UIFont {
    func bold() -> UIFont {
        guard let descriptor = fontDescriptor.withSymbolicTraits(.traitBold) else { return self }
        return UIFont(descriptor: descriptor, size: pointSize)
    }
}
