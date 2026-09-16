import UIKit

@MainActor
final class AvatarCropViewController: UIViewController, UIScrollViewDelegate {
    var onCrop: ((UIImage) -> Void)?

    private let image: UIImage
    private let scrollView = UIScrollView()
    private let imageView = UIImageView()
    private let cropContainer = UIView()
    private let overlayView = OverlayMaskView()
    private let hintLabel = UILabel()
    private let slider = UISlider()
    private let minusButton = UIButton(type: .system)
    private let plusButton = UIButton(type: .system)
    private let cancelButton = UIButton(type: .system)
    private let saveButton = UIButton(type: .system)
    private var minZoom: CGFloat = 1
    private var hasLaidOutImage = false

    init(image: UIImage, onCrop: ((UIImage) -> Void)? = nil) {
        self.image = AvatarCrop.workingImage(image)
        self.onCrop = onCrop
        super.init(nibName: nil, bundle: nil)
        modalPresentationStyle = .fullScreen
        modalTransitionStyle = .coverVertical
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    override var preferredStatusBarStyle: UIStatusBarStyle { .lightContent }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 0.14, green: 0.15, blue: 0.15, alpha: 1)

        let title = UILabel()
        title.text = "Cắt ảnh"
        title.font = .systemFont(ofSize: 22, weight: .bold)
        title.textColor = UIColor(white: 0.96, alpha: 1)
        title.translatesAutoresizingMaskIntoConstraints = false

        cropContainer.translatesAutoresizingMaskIntoConstraints = false
        cropContainer.backgroundColor = .black
        cropContainer.clipsToBounds = true

        scrollView.translatesAutoresizingMaskIntoConstraints = false
        scrollView.delegate = self
        scrollView.showsVerticalScrollIndicator = false
        scrollView.showsHorizontalScrollIndicator = false
        scrollView.bouncesZoom = true
        scrollView.alwaysBounceVertical = true
        scrollView.alwaysBounceHorizontal = true
        scrollView.contentInsetAdjustmentBehavior = .never
        scrollView.backgroundColor = .black
        scrollView.maximumZoomScale = AvatarCrop.maxZoom

        imageView.image = image
        imageView.contentMode = .scaleToFill
        imageView.isUserInteractionEnabled = true

        overlayView.translatesAutoresizingMaskIntoConstraints = false
        overlayView.isUserInteractionEnabled = false

        hintLabel.text = "Kéo để di chuyển ảnh"
        hintLabel.font = .systemFont(ofSize: 13, weight: .semibold)
        hintLabel.textColor = .white
        hintLabel.textAlignment = .center
        hintLabel.backgroundColor = UIColor.black.withAlphaComponent(0.58)
        hintLabel.layer.cornerRadius = 10
        hintLabel.layer.masksToBounds = true
        hintLabel.translatesAutoresizingMaskIntoConstraints = false

        minusButton.setTitle("−", for: .normal)
        minusButton.titleLabel?.font = .systemFont(ofSize: 28, weight: .medium)
        minusButton.tintColor = UIColor(white: 0.9, alpha: 1)
        minusButton.addAction(UIAction { [weak self] _ in self?.nudgeZoom(-0.12) }, for: .touchUpInside)
        plusButton.setTitle("+", for: .normal)
        plusButton.titleLabel?.font = .systemFont(ofSize: 28, weight: .medium)
        plusButton.tintColor = UIColor(white: 0.9, alpha: 1)
        plusButton.addAction(UIAction { [weak self] _ in self?.nudgeZoom(0.12) }, for: .touchUpInside)

        slider.minimumValue = Float(AvatarCrop.minZoom)
        slider.maximumValue = Float(AvatarCrop.maxZoom)
        slider.value = Float(AvatarCrop.minZoom)
        slider.minimumTrackTintColor = UIColor(red: 0.11, green: 0.45, blue: 0.89, alpha: 1)
        slider.maximumTrackTintColor = UIColor(white: 0.23, alpha: 1)
        slider.addAction(UIAction { [weak self] _ in self?.sliderChanged() }, for: .valueChanged)

        let zoomRow = UIStackView(arrangedSubviews: [minusButton, slider, plusButton])
        zoomRow.axis = .horizontal
        zoomRow.alignment = .center
        zoomRow.spacing = 8
        zoomRow.translatesAutoresizingMaskIntoConstraints = false

        cancelButton.setTitle("Hủy", for: .normal)
        cancelButton.titleLabel?.font = .systemFont(ofSize: 17, weight: .bold)
        cancelButton.tintColor = UIColor(red: 0.18, green: 0.53, blue: 1, alpha: 1)
        cancelButton.addAction(UIAction { [weak self] _ in self?.dismiss(animated: true) }, for: .touchUpInside)

        saveButton.setTitle("Lưu", for: .normal)
        saveButton.titleLabel?.font = .systemFont(ofSize: 17, weight: .bold)
        saveButton.setTitleColor(.white, for: .normal)
        saveButton.backgroundColor = UIColor(red: 0.11, green: 0.45, blue: 0.89, alpha: 1)
        saveButton.layer.cornerRadius = 6
        saveButton.addAction(UIAction { [weak self] _ in self?.saveCrop() }, for: .touchUpInside)

        let actions = UIStackView(arrangedSubviews: [UIView(), cancelButton, saveButton])
        actions.axis = .horizontal
        actions.alignment = .center
        actions.spacing = 8
        actions.translatesAutoresizingMaskIntoConstraints = false

        view.addSubview(title)
        view.addSubview(cropContainer)
        cropContainer.addSubview(scrollView)
        scrollView.addSubview(imageView)
        cropContainer.addSubview(overlayView)
        cropContainer.addSubview(hintLabel)
        view.addSubview(zoomRow)
        view.addSubview(actions)

        NSLayoutConstraint.activate([
            title.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 12),
            title.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 20),

            cropContainer.topAnchor.constraint(equalTo: title.bottomAnchor, constant: 16),
            cropContainer.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 16),
            cropContainer.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -16),
            cropContainer.heightAnchor.constraint(equalTo: cropContainer.widthAnchor),

            scrollView.leadingAnchor.constraint(equalTo: cropContainer.leadingAnchor),
            scrollView.trailingAnchor.constraint(equalTo: cropContainer.trailingAnchor),
            scrollView.topAnchor.constraint(equalTo: cropContainer.topAnchor),
            scrollView.bottomAnchor.constraint(equalTo: cropContainer.bottomAnchor),

            overlayView.leadingAnchor.constraint(equalTo: cropContainer.leadingAnchor),
            overlayView.trailingAnchor.constraint(equalTo: cropContainer.trailingAnchor),
            overlayView.topAnchor.constraint(equalTo: cropContainer.topAnchor),
            overlayView.bottomAnchor.constraint(equalTo: cropContainer.bottomAnchor),

            hintLabel.topAnchor.constraint(equalTo: cropContainer.topAnchor, constant: 14),
            hintLabel.centerXAnchor.constraint(equalTo: cropContainer.centerXAnchor),
            hintLabel.widthAnchor.constraint(lessThanOrEqualTo: cropContainer.widthAnchor, multiplier: 0.86),

            zoomRow.topAnchor.constraint(equalTo: cropContainer.bottomAnchor, constant: 20),
            zoomRow.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 16),
            zoomRow.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -16),

            minusButton.widthAnchor.constraint(equalToConstant: 36),
            plusButton.widthAnchor.constraint(equalToConstant: 36),

            actions.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 16),
            actions.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -16),
            actions.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -12),
            saveButton.heightAnchor.constraint(equalToConstant: 40),
            saveButton.widthAnchor.constraint(greaterThanOrEqualToConstant: 84),
        ])
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        overlayView.setNeedsLayout()
        configureImageIfNeeded()
    }

    func viewForZooming(in scrollView: UIScrollView) -> UIView? { imageView }

    func scrollViewDidZoom(_ scrollView: UIScrollView) {
        let relative = scrollView.zoomScale / minZoom
        if abs(slider.value - Float(relative)) > 0.01 {
            slider.value = Float(relative)
        }
    }

    private func configureImageIfNeeded() {
        let bounds = scrollView.bounds
        guard bounds.width > 1, bounds.height > 1, !hasLaidOutImage else { return }
        hasLaidOutImage = true
        imageView.frame = CGRect(origin: .zero, size: image.size)
        scrollView.contentSize = image.size
        minZoom = max(bounds.width / image.size.width, bounds.height / image.size.height)
        scrollView.minimumZoomScale = minZoom
        scrollView.maximumZoomScale = minZoom * AvatarCrop.maxZoom
        scrollView.zoomScale = minZoom
        centerContent()
        slider.value = Float(AvatarCrop.minZoom)
    }

    private func centerContent() {
        let bounds = scrollView.bounds
        let offsetX = max(0, (scrollView.contentSize.width - bounds.width) / 2)
        let offsetY = max(0, (scrollView.contentSize.height - bounds.height) / 2)
        scrollView.contentOffset = CGPoint(x: offsetX, y: offsetY)
    }

    private func nudgeZoom(_ delta: Float) {
        slider.value = min(slider.maximumValue, max(slider.minimumValue, slider.value + delta))
        sliderChanged()
    }

    private func sliderChanged() {
        let target = minZoom * CGFloat(slider.value)
        zoomKeepingCenter(to: target)
    }

    private func zoomKeepingCenter(to scale: CGFloat) {
        let clamped = min(scrollView.maximumZoomScale, max(scrollView.minimumZoomScale, scale))
        let center = CGPoint(
            x: scrollView.contentOffset.x + scrollView.bounds.width / 2,
            y: scrollView.contentOffset.y + scrollView.bounds.height / 2
        )
        let ratio = clamped / max(scrollView.zoomScale, 0.0001)
        scrollView.setZoomScale(clamped, animated: false)
        var offset = CGPoint(
            x: center.x * ratio - scrollView.bounds.width / 2,
            y: center.y * ratio - scrollView.bounds.height / 2
        )
        let maxX = max(0, scrollView.contentSize.width - scrollView.bounds.width)
        let maxY = max(0, scrollView.contentSize.height - scrollView.bounds.height)
        offset.x = min(maxX, max(0, offset.x))
        offset.y = min(maxY, max(0, offset.y))
        scrollView.contentOffset = offset
    }

    private func saveCrop() {
        let zoom = max(scrollView.zoomScale, 0.0001)
        let visible = CGRect(
            x: scrollView.contentOffset.x / zoom,
            y: scrollView.contentOffset.y / zoom,
            width: scrollView.bounds.width / zoom,
            height: scrollView.bounds.height / zoom
        )
        guard let cropped = AvatarCrop.croppedSquare(from: image, visibleRect: visible) else { return }
        let handler = onCrop
        dismiss(animated: true) {
            handler?(cropped)
        }
    }
}

private final class OverlayMaskView: UIView {
    private let dimLayer = CAShapeLayer()

    override init(frame: CGRect) {
        super.init(frame: frame)
        isUserInteractionEnabled = false
        backgroundColor = .clear
        dimLayer.fillRule = .evenOdd
        dimLayer.fillColor = UIColor.black.withAlphaComponent(0.58).cgColor
        layer.addSublayer(dimLayer)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    override func layoutSubviews() {
        super.layoutSubviews()
        dimLayer.frame = bounds
        let path = UIBezierPath(rect: bounds)
        path.append(UIBezierPath(ovalIn: bounds))
        dimLayer.path = path.cgPath
    }
}
