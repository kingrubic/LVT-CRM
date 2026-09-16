import Foundation
import UIKit

extension Notification.Name {
    static let accountAvatarDidChange = Notification.Name("AccountAvatarDidChange")
}

let avatarMaxBytes = 2 * 1024 * 1024
let avatarMaxEdge: CGFloat = 512

func prepareAvatarJPEG(_ image: UIImage) -> Data? {
    let size = image.size
    let largest = max(size.width, size.height)
    guard largest > 0 else { return nil }
    let scale = largest > avatarMaxEdge ? avatarMaxEdge / largest : 1
    let newSize = CGSize(
        width: max(1, floor(size.width * scale)),
        height: max(1, floor(size.height * scale))
    )
    let renderer = UIGraphicsImageRenderer(size: newSize)
    let scaled = renderer.image { _ in image.draw(in: CGRect(origin: .zero, size: newSize)) }
    var quality: CGFloat = 0.85
    var data = scaled.jpegData(compressionQuality: quality)
    while let current = data, current.count > avatarMaxBytes, quality > 0.5 {
        quality -= 0.1
        data = scaled.jpegData(compressionQuality: quality)
    }
    guard let data, data.count <= avatarMaxBytes, !data.isEmpty else { return nil }
    return data
}

actor AvatarRepository {
    private let convex: ConvexHttpClient
    private let tokenProvider: @Sendable () -> String?
    private let session: URLSession
    private var cachedKey: String?
    private var cachedImage: UIImage?

    init(convex: ConvexHttpClient, tokenProvider: @escaping @Sendable () -> String?) {
        self.convex = convex
        self.tokenProvider = tokenProvider
        let configuration = URLSessionConfiguration.ephemeral
        configuration.timeoutIntervalForRequest = 45
        configuration.timeoutIntervalForResource = 60
        session = URLSession(configuration: configuration)
    }

    func image(userId: String, hasAvatar: Bool, version: String?) async -> UIImage? {
        guard hasAvatar else {
            cachedKey = nil
            cachedImage = nil
            return nil
        }
        let key = "\(userId):\(version ?? "current")"
        if cachedKey == key { return cachedImage }
        guard let token = tokenProvider(), !token.isEmpty,
              let url = URL(string: "\(ConvexConfig.webURL)/api/files/avatar") else { return cachedImage }
        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        do {
            let (data, response) = try await session.data(for: request)
            let status = (response as? HTTPURLResponse)?.statusCode ?? 0
            guard status == 200, !data.isEmpty, let image = UIImage(data: data) else { return cachedImage }
            cachedKey = key
            cachedImage = image
            return image
        } catch {
            return cachedImage
        }
    }

    func upload(image: UIImage) async throws -> UIImage {
        guard let jpeg = prepareAvatarJPEG(image) else {
            throw ConvexException(code: "INVALID_AVATAR_FILE")
        }
        let upload = try await convex.mutation("userAvatar:generateUploadUrl")
        guard let uploadUrlString = upload["value"] as? String,
              let uploadUrl = URL(string: uploadUrlString) else {
            throw ConvexException(code: "AVATAR_UPLOAD_FAILED")
        }
        var request = URLRequest(url: uploadUrl)
        request.httpMethod = "POST"
        request.setValue("image/jpeg", forHTTPHeaderField: "Content-Type")
        request.httpBody = jpeg
        let (data, response) = try await session.data(for: request)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard status >= 200, status < 300,
              let payload = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let storageId = payload["storageId"] as? String, !storageId.isEmpty else {
            throw ConvexException(code: "AVATAR_UPLOAD_FAILED")
        }
        _ = try await convex.action("userAvatar:setOwnAvatar", args: [
            "storageId": storageId,
            "fileName": "avatar.jpg",
            "fileSize": jpeg.count,
        ])
        let saved = UIImage(data: jpeg) ?? image
        cachedKey = nil
        cachedImage = saved
        return saved
    }

    func clear() async throws {
        _ = try await convex.mutation("userAvatar:clearOwnAvatar")
        cachedKey = nil
        cachedImage = nil
    }
}
