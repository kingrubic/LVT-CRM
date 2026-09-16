import Foundation
import ImageIO
import UIKit
import UniformTypeIdentifiers

enum AvatarCrop {
    static let minZoom: CGFloat = 1
    static let maxZoom: CGFloat = 4
    static let outputEdge: CGFloat = 512

    static func normalizedImage(_ image: UIImage) -> UIImage {
        if image.imageOrientation == .up { return image }
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = image.scale
        let renderer = UIGraphicsImageRenderer(size: image.size, format: format)
        return renderer.image { _ in
            image.draw(in: CGRect(origin: .zero, size: image.size))
        }
    }

    static func workingImage(_ image: UIImage, maxEdge: CGFloat = 2048) -> UIImage {
        let normalized = normalizedImage(image)
        let largest = max(normalized.size.width, normalized.size.height)
        guard largest > maxEdge else { return normalized }
        let scale = maxEdge / largest
        let newSize = CGSize(
            width: max(1, floor(normalized.size.width * scale)),
            height: max(1, floor(normalized.size.height * scale))
        )
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        format.opaque = true
        let renderer = UIGraphicsImageRenderer(size: newSize, format: format)
        return renderer.image { _ in
            normalized.draw(in: CGRect(origin: .zero, size: newSize))
        }
    }

    static func croppedSquare(from image: UIImage, visibleRect: CGRect) -> UIImage? {
        guard visibleRect.width > 0, visibleRect.height > 0, image.size.width > 0 else { return nil }
        let output = min(outputEdge, max(visibleRect.width, visibleRect.height) * image.scale)
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        format.opaque = true
        let renderer = UIGraphicsImageRenderer(size: CGSize(width: output, height: output), format: format)
        return renderer.image { ctx in
            UIColor.black.setFill()
            ctx.fill(CGRect(x: 0, y: 0, width: output, height: output))
            let drawRect = CGRect(
                x: -visibleRect.origin.x * output / visibleRect.width,
                y: -visibleRect.origin.y * output / visibleRect.height,
                width: image.size.width * output / visibleRect.width,
                height: image.size.height * output / visibleRect.height
            )
            image.draw(in: drawRect)
        }
    }

    static func encodeWebP(_ image: UIImage) -> Data? {
        let sized = scaledForUpload(image)
        var quality: CGFloat = 0.82
        var data = webPData(sized, quality: quality)
        while let current = data, current.count > avatarMaxBytes, quality > 0.45 {
            quality -= 0.1
            data = webPData(sized, quality: quality)
        }
        if let data, data.count <= avatarMaxBytes, !data.isEmpty {
            return data
        }
        quality = 0.85
        var jpeg = sized.jpegData(compressionQuality: quality)
        while let current = jpeg, current.count > avatarMaxBytes, quality > 0.45 {
            quality -= 0.1
            jpeg = sized.jpegData(compressionQuality: quality)
        }
        guard let jpeg, jpeg.count <= avatarMaxBytes, !jpeg.isEmpty else { return nil }
        return jpeg
    }

    static func contentType(for data: Data) -> (fileName: String, mime: String) {
        if data.count >= 12,
           data[0] == 0x52, data[1] == 0x49, data[2] == 0x46, data[3] == 0x46,
           data[8] == 0x57, data[9] == 0x45, data[10] == 0x42, data[11] == 0x50 {
            return ("avatar.webp", "image/webp")
        }
        return ("avatar.jpg", "image/jpeg")
    }

    private static func scaledForUpload(_ image: UIImage) -> UIImage {
        let largest = max(image.size.width, image.size.height)
        guard largest > 0 else { return image }
        let scale = largest > avatarMaxEdge ? avatarMaxEdge / largest : 1
        let newSize = CGSize(
            width: max(1, floor(image.size.width * scale)),
            height: max(1, floor(image.size.height * scale))
        )
        if newSize == image.size { return image }
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        format.opaque = true
        let renderer = UIGraphicsImageRenderer(size: newSize, format: format)
        return renderer.image { _ in image.draw(in: CGRect(origin: .zero, size: newSize)) }
    }

    private static func webPData(_ image: UIImage, quality: CGFloat) -> Data? {
        guard let cgImage = image.cgImage else { return nil }
        let data = NSMutableData()
        let types: [CFString] = [
            UTType.webP.identifier as CFString,
            "public.webp" as CFString,
        ]
        for type in types {
            data.length = 0
            guard let destination = CGImageDestinationCreateWithData(data, type, 1, nil) else { continue }
            CGImageDestinationAddImage(destination, cgImage, [
                kCGImageDestinationLossyCompressionQuality: quality,
            ] as CFDictionary)
            if CGImageDestinationFinalize(destination), data.length > 0 {
                return data as Data
            }
        }
        return nil
    }
}
