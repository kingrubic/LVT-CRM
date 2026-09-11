import QuickLook
import UIKit

@MainActor
final class SharedDutyScheduleViewController: UIViewController, QLPreviewControllerDataSource {
    private let repository: DutiesRepository
    private let modeControl = UISegmentedControl(items: ["Tuần", "Tháng"])
    private let rangeLabel = UILabel()
    private let hintLabel = UILabel()
    private let errorLabel = UILabel()
    private let viewButton = UIButton(type: .system)
    private let spinner = UIActivityIndicatorView(style: .medium)
    private var mode = "week"
    private var anchorIso = DutyScheduleCalendar.todayIso()
    private var previewURL: URL?
    private var previewFileName = "LCT.pdf"
    private var loading = false

    init(repository: DutiesRepository) {
        self.repository = repository
        super.init(nibName: nil, bundle: nil)
        title = "Lịch công tác chung"
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemGroupedBackground
        navigationItem.largeTitleDisplayMode = .never

        modeControl.selectedSegmentIndex = 0
        modeControl.addTarget(self, action: #selector(modeChanged), for: .valueChanged)
        modeControl.translatesAutoresizingMaskIntoConstraints = false

        rangeLabel.font = .preferredFont(forTextStyle: .title3)
        rangeLabel.textAlignment = .center
        rangeLabel.adjustsFontForContentSizeCategory = true
        rangeLabel.numberOfLines = 0

        let previous = UIButton(type: .system)
        previous.setImage(UIImage(systemName: "chevron.left"), for: .normal)
        previous.accessibilityLabel = "Kỳ trước"
        previous.addTarget(self, action: #selector(shiftPrevious), for: .touchUpInside)
        let next = UIButton(type: .system)
        next.setImage(UIImage(systemName: "chevron.right"), for: .normal)
        next.accessibilityLabel = "Kỳ sau"
        next.addTarget(self, action: #selector(shiftNext), for: .touchUpInside)
        previous.widthAnchor.constraint(equalToConstant: 44).isActive = true
        next.widthAnchor.constraint(equalToConstant: 44).isActive = true
        previous.heightAnchor.constraint(greaterThanOrEqualToConstant: 44).isActive = true
        next.heightAnchor.constraint(greaterThanOrEqualToConstant: 44).isActive = true

        let rangeRow = UIStackView(arrangedSubviews: [previous, rangeLabel, next])
        rangeRow.axis = .horizontal
        rangeRow.alignment = .center
        rangeRow.spacing = 8

        let today = UIButton(type: .system)
        today.setTitle("Hôm nay", for: .normal)
        today.addTarget(self, action: #selector(jumpToday), for: .touchUpInside)

        hintLabel.text = "Xem bản PDF giống lịch công tác trên máy tính, rồi tải về nếu cần."
        hintLabel.font = .preferredFont(forTextStyle: .body)
        hintLabel.textColor = .secondaryLabel
        hintLabel.textAlignment = .center
        hintLabel.numberOfLines = 0
        hintLabel.adjustsFontForContentSizeCategory = true

        errorLabel.font = .preferredFont(forTextStyle: .body)
        errorLabel.textColor = .systemRed
        errorLabel.textAlignment = .center
        errorLabel.numberOfLines = 0
        errorLabel.isHidden = true
        errorLabel.adjustsFontForContentSizeCategory = true

        var buttonConfiguration = UIButton.Configuration.filled()
        buttonConfiguration.title = "Xem lịch"
        buttonConfiguration.cornerStyle = .large
        viewButton.configuration = buttonConfiguration
        viewButton.addTarget(self, action: #selector(loadPdf), for: .touchUpInside)
        viewButton.heightAnchor.constraint(greaterThanOrEqualToConstant: 52).isActive = true

        spinner.hidesWhenStopped = true

        let stack = UIStackView(arrangedSubviews: [
            modeControl,
            rangeRow,
            today,
            hintLabel,
            errorLabel,
            UIView(),
            viewButton,
        ])
        stack.translatesAutoresizingMaskIntoConstraints = false
        stack.axis = .vertical
        stack.alignment = .fill
        stack.spacing = 16
        stack.setCustomSpacing(8, after: rangeRow)
        view.addSubview(stack)
        view.addSubview(spinner)
        spinner.translatesAutoresizingMaskIntoConstraints = false

        NSLayoutConstraint.activate([
            stack.leadingAnchor.constraint(equalTo: view.layoutMarginsGuide.leadingAnchor),
            stack.trailingAnchor.constraint(equalTo: view.layoutMarginsGuide.trailingAnchor),
            stack.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 20),
            stack.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -20),
            spinner.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            spinner.centerYAnchor.constraint(equalTo: viewButton.centerYAnchor),
        ])
        renderRange()
    }

    @objc private func modeChanged() {
        mode = modeControl.selectedSegmentIndex == 1 ? "month" : "week"
        renderRange()
    }

    @objc private func shiftPrevious() {
        anchorIso = DutyScheduleCalendar.shiftScheduleAnchor(mode: mode, anchorIso: anchorIso, direction: -1)
        renderRange()
    }

    @objc private func shiftNext() {
        anchorIso = DutyScheduleCalendar.shiftScheduleAnchor(mode: mode, anchorIso: anchorIso, direction: 1)
        renderRange()
    }

    @objc private func jumpToday() {
        anchorIso = DutyScheduleCalendar.todayIso()
        renderRange()
    }

    @objc private func loadPdf() {
        guard !loading else { return }
        loading = true
        errorLabel.isHidden = true
        viewButton.isEnabled = false
        spinner.startAnimating()
        Task { [weak self] in
            guard let self else { return }
            defer {
                loading = false
                viewButton.isEnabled = true
                spinner.stopAnimating()
            }
            do {
                let pdf = try await repository.downloadSharedSchedulePdf(mode: mode, anchorIso: anchorIso)
                previewURL = pdf.url
                previewFileName = pdf.fileName
                let preview = QLPreviewController()
                preview.dataSource = self
                preview.title = pdf.fileName
                preview.navigationItem.rightBarButtonItem = UIBarButtonItem(
                    image: UIImage(systemName: "square.and.arrow.down"),
                    style: .plain,
                    target: self,
                    action: #selector(sharePdf)
                )
                preview.navigationItem.rightBarButtonItem?.accessibilityLabel = "Tải xuống"
                navigationController?.pushViewController(preview, animated: !UIAccessibility.isReduceMotionEnabled)
            } catch {
                errorLabel.text = (error as? LocalizedError)?.errorDescription
                    ?? "Không tải được lịch công tác chung. Hãy thử lại."
                errorLabel.isHidden = false
            }
        }
    }

    @objc private func sharePdf() {
        guard let previewURL else { return }
        let share = UIActivityViewController(activityItems: [previewURL], applicationActivities: nil)
        if let presented = navigationController?.visibleViewController {
            presented.present(share, animated: true)
        } else {
            present(share, animated: true)
        }
    }

    func numberOfPreviewItems(in controller: QLPreviewController) -> Int {
        previewURL == nil ? 0 : 1
    }

    func previewController(_ controller: QLPreviewController, previewItemAt index: Int) -> QLPreviewItem {
        previewURL! as NSURL
    }

    private func renderRange() {
        rangeLabel.text = DutyScheduleCalendar.scheduleRange(mode: mode, anchorIso: anchorIso).shortLabel
    }
}
