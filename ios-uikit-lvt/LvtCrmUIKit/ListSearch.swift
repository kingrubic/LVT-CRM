import UIKit

struct ListSearchValues: Equatable {
    var query = ""
    var department = ""
    var person = ""
    var location = ""
    var dateFrom = ""
    var dateTo = ""

    func advancedCount(includeLocation: Bool = true) -> Int {
        var fields = [department, person, dateFrom, dateTo]
        if includeLocation { fields.append(location) }
        return fields.filter { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }.count
    }

    var isActive: Bool {
        !query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || advancedCount() > 0
    }
}

enum ListSearch {
    static func normalize(_ value: String?) -> String {
        let folded = (value ?? "")
            .replacingOccurrences(of: "đ", with: "d")
            .replacingOccurrences(of: "Đ", with: "D")
            .folding(options: [.diacriticInsensitive, .caseInsensitive], locale: Locale(identifier: "vi_VN"))
            .lowercased()
        return folded.replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression)
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }

    static func includes(_ haystack: String?, _ needle: String) -> Bool {
        if needle.isEmpty { return true }
        return normalize(haystack).contains(needle)
    }

    static func dateRangeOverlaps(start: String, end: String, dateFrom: String, dateTo: String) -> Bool {
        if dateFrom.isEmpty && dateTo.isEmpty { return true }
        if start.isEmpty { return false }
        let rangeEnd = end.isEmpty ? start : end
        if !dateFrom.isEmpty && rangeEnd < dateFrom { return false }
        if !dateTo.isEmpty && start > dateTo { return false }
        return true
    }

    static func anyDate(_ dates: [String], dateFrom: String, dateTo: String) -> Bool {
        if dateFrom.isEmpty && dateTo.isEmpty { return true }
        let deadlines = dates.filter { !$0.isEmpty }
        if deadlines.isEmpty { return false }
        return deadlines.contains { deadline in
            (dateFrom.isEmpty || deadline >= dateFrom) && (dateTo.isEmpty || deadline <= dateTo)
        }
    }

    static func displayDate(_ value: String) -> String {
        let parts = value.split(separator: "-")
        guard parts.count == 3 else { return "" }
        return "\(parts[2])/\(parts[1])/\(parts[0])"
    }
}

final class ListSearchHeaderView: UIView, UITextFieldDelegate {
    var onChange: ((ListSearchValues) -> Void)?
    var onNeedsLayout: (() -> Void)?

    private var values = ListSearchValues()
    private var includeLocation = true
    private var advancedOpen = false
    private let queryField = UITextField()
    private let advancedButton = UIButton(type: .system)
    private let badgeLabel = UILabel()
    private let advancedStack = UIStackView()
    private let departmentField = UITextField()
    private let personField = UITextField()
    private let locationField = UITextField()
    private let dateFromField = UITextField()
    private let dateToField = UITextField()
    private let dateFromPicker = UIDatePicker()
    private let dateToPicker = UIDatePicker()
    private let clearButton = UIButton(type: .system)

    override init(frame: CGRect) {
        super.init(frame: frame)
        setup()
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    func configure(
        values: ListSearchValues,
        queryPlaceholder: String,
        personPlaceholder: String,
        includeLocation: Bool
    ) {
        self.includeLocation = includeLocation
        queryField.placeholder = queryPlaceholder
        personField.placeholder = personPlaceholder
        locationField.isHidden = !includeLocation
        if !queryField.isFirstResponder { queryField.text = values.query }
        if !departmentField.isFirstResponder { departmentField.text = values.department }
        if !personField.isFirstResponder { personField.text = values.person }
        if !locationField.isFirstResponder { locationField.text = values.location }
        dateFromField.text = ListSearch.displayDate(values.dateFrom)
        dateToField.text = ListSearch.displayDate(values.dateTo)
        self.values = values
        refreshAdvanced()
    }

    override var intrinsicContentSize: CGSize {
        let target = CGSize(width: bounds.width > 0 ? bounds.width : UIScreen.main.bounds.width, height: UIView.layoutFittingCompressedSize.height)
        return systemLayoutSizeFitting(
            target,
            withHorizontalFittingPriority: .required,
            verticalFittingPriority: .fittingSizeLevel
        )
    }

    private func setup() {
        let row = UIStackView(arrangedSubviews: [queryField, advancedButton])
        row.axis = .horizontal
        row.spacing = 8
        row.alignment = .center

        styleField(queryField, placeholder: "")
        queryField.addTarget(self, action: #selector(queryChanged), for: .editingChanged)
        queryField.delegate = self
        queryField.returnKeyType = .search
        queryField.clearButtonMode = .whileEditing

        var config = UIButton.Configuration.tinted()
        config.image = UIImage(systemName: "magnifyingglass")
        config.cornerStyle = .medium
        advancedButton.configuration = config
        advancedButton.accessibilityLabel = "Tìm kiếm nâng cao"
        advancedButton.addAction(UIAction { [weak self] _ in
            guard let self else { return }
            self.advancedOpen.toggle()
            self.refreshAdvanced()
        }, for: .touchUpInside)
        advancedButton.widthAnchor.constraint(equalToConstant: 44).isActive = true
        advancedButton.heightAnchor.constraint(equalToConstant: 44).isActive = true

        badgeLabel.font = .preferredFont(forTextStyle: .caption2)
        badgeLabel.textColor = .white
        badgeLabel.backgroundColor = UIColor(red: 19 / 255, green: 143 / 255, blue: 123 / 255, alpha: 1)
        badgeLabel.textAlignment = .center
        badgeLabel.layer.cornerRadius = 8
        badgeLabel.clipsToBounds = true
        badgeLabel.translatesAutoresizingMaskIntoConstraints = false
        advancedButton.addSubview(badgeLabel)
        NSLayoutConstraint.activate([
            badgeLabel.widthAnchor.constraint(greaterThanOrEqualToConstant: 16),
            badgeLabel.heightAnchor.constraint(equalToConstant: 16),
            badgeLabel.topAnchor.constraint(equalTo: advancedButton.topAnchor, constant: -2),
            badgeLabel.trailingAnchor.constraint(equalTo: advancedButton.trailingAnchor, constant: 2),
        ])

        styleField(departmentField, placeholder: "Tên phòng ban")
        styleField(personField, placeholder: "")
        styleField(locationField, placeholder: "Địa điểm công tác")
        styleField(dateFromField, placeholder: "Thời gian từ")
        styleField(dateToField, placeholder: "Thời gian đến")
        departmentField.addTarget(self, action: #selector(departmentChanged), for: .editingChanged)
        personField.addTarget(self, action: #selector(personChanged), for: .editingChanged)
        locationField.addTarget(self, action: #selector(locationChanged), for: .editingChanged)

        configureDateField(dateFromField, picker: dateFromPicker, action: #selector(dateFromPicked))
        configureDateField(dateToField, picker: dateToPicker, action: #selector(dateToPicked))

        clearButton.setTitle("Xóa bộ lọc", for: .normal)
        clearButton.titleLabel?.font = .preferredFont(forTextStyle: .subheadline)
        clearButton.contentHorizontalAlignment = .leading
        clearButton.addAction(UIAction { [weak self] _ in self?.clearAdvanced() }, for: .touchUpInside)

        advancedStack.axis = .vertical
        advancedStack.spacing = 8
        [
            labeled("Phòng ban", departmentField),
            labeled("Cá nhân", personField),
            labeled("Thời gian từ", dateFromField),
            labeled("Thời gian đến", dateToField),
            labeled("Địa điểm", locationField),
            clearButton,
        ].forEach(advancedStack.addArrangedSubview)

        let stack = UIStackView(arrangedSubviews: [row, advancedStack])
        stack.axis = .vertical
        stack.spacing = 10
        stack.translatesAutoresizingMaskIntoConstraints = false
        addSubview(stack)
        NSLayoutConstraint.activate([
            stack.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 16),
            stack.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -16),
            stack.topAnchor.constraint(equalTo: topAnchor, constant: 8),
            stack.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -8),
        ])
        refreshAdvanced()
    }

    func textFieldShouldReturn(_ textField: UITextField) -> Bool {
        textField.resignFirstResponder()
        return true
    }

    func textFieldShouldClear(_ textField: UITextField) -> Bool {
        if textField === dateFromField { emit { $0.dateFrom = "" } }
        if textField === dateToField { emit { $0.dateTo = "" } }
        return true
    }

    @objc private func queryChanged() { emit { $0.query = queryField.text ?? "" } }
    @objc private func departmentChanged() { emit { $0.department = departmentField.text ?? "" } }
    @objc private func personChanged() { emit { $0.person = personField.text ?? "" } }
    @objc private func locationChanged() { emit { $0.location = locationField.text ?? "" } }

    @objc private func dateFromPicked() {
        emit { $0.dateFrom = Self.isoDate(from: dateFromPicker.date) }
        dateFromField.text = ListSearch.displayDate(values.dateFrom)
        dateFromField.resignFirstResponder()
    }

    @objc private func dateToPicked() {
        emit { $0.dateTo = Self.isoDate(from: dateToPicker.date) }
        dateToField.text = ListSearch.displayDate(values.dateTo)
        dateToField.resignFirstResponder()
    }

    private func clearAdvanced() {
        emit {
            $0.department = ""
            $0.person = ""
            if includeLocation { $0.location = "" }
            $0.dateFrom = ""
            $0.dateTo = ""
        }
        departmentField.text = ""
        personField.text = ""
        locationField.text = ""
        dateFromField.text = ""
        dateToField.text = ""
        refreshAdvanced()
    }

    private func emit(_ mutate: (inout ListSearchValues) -> Void) {
        mutate(&values)
        refreshAdvanced()
        onChange?(values)
    }

    private func refreshAdvanced() {
        let count = values.advancedCount(includeLocation: includeLocation)
        advancedStack.isHidden = !advancedOpen
        locationField.superview?.isHidden = !includeLocation
        clearButton.isHidden = count == 0
        badgeLabel.isHidden = count == 0
        badgeLabel.text = count == 0 ? nil : "\(count)"
        advancedButton.tintColor = (advancedOpen || count > 0)
            ? UIColor(red: 20 / 255, green: 53 / 255, blue: 95 / 255, alpha: 1)
            : .secondaryLabel
        invalidateIntrinsicContentSize()
        onNeedsLayout?()
    }

    private func styleField(_ field: UITextField, placeholder: String) {
        field.placeholder = placeholder
        field.borderStyle = .roundedRect
        field.backgroundColor = .secondarySystemGroupedBackground
        field.font = .preferredFont(forTextStyle: .subheadline)
        field.adjustsFontForContentSizeCategory = true
        field.clearButtonMode = .whileEditing
        field.heightAnchor.constraint(greaterThanOrEqualToConstant: 40).isActive = true
    }

    private func labeled(_ title: String, _ field: UITextField) -> UIStackView {
        let label = UILabel()
        label.text = title
        label.font = .preferredFont(forTextStyle: .caption1)
        label.textColor = .secondaryLabel
        let stack = UIStackView(arrangedSubviews: [label, field])
        stack.axis = .vertical
        stack.spacing = 4
        return stack
    }

    private func configureDateField(_ field: UITextField, picker: UIDatePicker, action: Selector) {
        picker.datePickerMode = .date
        picker.preferredDatePickerStyle = .wheels
        picker.timeZone = TimeZone(secondsFromGMT: 7 * 3600)
        picker.calendar = Calendar(identifier: .gregorian)
        picker.addTarget(self, action: action, for: .valueChanged)
        field.inputView = picker
        field.clearButtonMode = .always
        field.delegate = self
        let toolbar = UIToolbar()
        toolbar.sizeToFit()
        toolbar.items = [
            UIBarButtonItem(systemItem: .flexibleSpace),
            UIBarButtonItem(title: "Xong", style: .done, target: self, action: action),
        ]
        field.inputAccessoryView = toolbar
        field.addAction(UIAction { [weak field] _ in
            if field?.text?.isEmpty == true {
                field?.resignFirstResponder()
            }
        }, for: .editingChanged)
    }

    private static func isoDate(from date: Date) -> String {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(secondsFromGMT: 7 * 3600) ?? .current
        let parts = calendar.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", parts.year ?? 0, parts.month ?? 0, parts.day ?? 0)
    }
}
