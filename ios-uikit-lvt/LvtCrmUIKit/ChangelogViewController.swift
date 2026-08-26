import UIKit

@MainActor
final class ChangelogViewController: UITableViewController {
    private let entries: [AppChangelogEntry]
    private let currentVersion: String

    init(currentVersion: String = AppVersion.marketing) {
        self.currentVersion = currentVersion
        self.entries = AppChangelog.visibleEntries(currentVersion: currentVersion)
        super.init(style: .insetGrouped)
        title = "Lịch sử thay đổi"
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    override func viewDidLoad() {
        super.viewDidLoad()
        navigationItem.largeTitleDisplayMode = .never
        tableView.backgroundColor = .systemGroupedBackground
        tableView.cellLayoutMarginsFollowReadableWidth = true
        tableView.register(UITableViewCell.self, forCellReuseIdentifier: "Cell")
    }

    override func numberOfSections(in tableView: UITableView) -> Int {
        entries.count
    }

    override func tableView(_ tableView: UITableView, numberOfRowsInSection section: Int) -> Int {
        1
    }

    override func tableView(_ tableView: UITableView, titleForHeaderInSection section: Int) -> String? {
        "Phiên bản \(entries[section].version)"
    }

    override func tableView(_ tableView: UITableView, titleForFooterInSection section: Int) -> String? {
        section == 0 ? "Bản đang dùng: \(currentVersion)." : nil
    }

    override func tableView(
        _ tableView: UITableView,
        cellForRowAt indexPath: IndexPath
    ) -> UITableViewCell {
        let cell = tableView.dequeueReusableCell(withIdentifier: "Cell", for: indexPath)
        var content = cell.defaultContentConfiguration()
        content.text = entries[indexPath.section].highlights.map { "• \($0)" }.joined(separator: "\n")
        content.textProperties.numberOfLines = 0
        cell.contentConfiguration = content
        cell.selectionStyle = .none
        cell.accessibilityTraits = .staticText
        cell.accessibilityLabel = "Phiên bản \(entries[indexPath.section].version). \(entries[indexPath.section].highlights.joined(separator: ". "))"
        return cell
    }
}
