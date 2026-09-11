import Foundation

struct DutyDepartmentParticipants: Equatable, Sendable {
    let departmentName: String
    let participantNames: [String]
}

struct DutyItem: Identifiable, Equatable, Sendable {
    let id: String
    let content: String
    let startDate: String
    let endDate: String
    let startTime: String
    let endTime: String
    let allDay: Bool
    let locationNames: [String]
    let departmentNames: [String]
    let departmentParticipants: [DutyDepartmentParticipants]
    let participantNames: [String]
    var myStatus: String
    let isMine: Bool
    let isOngoing: Bool
    let isOverdue: Bool
    let isUpcoming: Bool
    var canMarkAttendance: Bool
    let title: String
    let createdBy: String
    let locationText: String
    let otherParticipants: String
}

struct DutiesSnapshot: Equatable, Sendable {
    let attendanceConfirmationEnabled: Bool
    let duties: [DutyItem]
    let canCreate: Bool
    let isAdmin: Bool
    let canViewAll: Bool
}

struct SharedSchedulePdf: Sendable {
    let url: URL
    let fileName: String
}

final class DutiesRepository: Sendable {
    private let convex: ConvexHttpClient
    private let tokenProvider: @Sendable () -> String?

    init(convex: ConvexHttpClient, tokenProvider: @escaping @Sendable () -> String? = { nil }) {
        self.convex = convex
        self.tokenProvider = tokenProvider
    }

    func listMine() async throws -> DutiesSnapshot {
        let result = try await convex.query("duties:listMine")
        let duties = (result["duties"] as? [[String: Any]] ?? []).compactMap(Self.decodeDuty)
        return DutiesSnapshot(
            attendanceConfirmationEnabled: (result["attendanceConfirmationEnabled"] as? Bool) ?? false,
            duties: duties,
            canCreate: (result["canCreate"] as? Bool) ?? false,
            isAdmin: (result["isAdmin"] as? Bool) ?? false,
            canViewAll: (result["canViewAll"] as? Bool) ?? false
        )
    }

    func setAttendance(dutyId: String, status: String) async throws {
        _ = try await convex.mutation(
            "duties:setAttendance",
            args: ["dutyId": dutyId, "status": status]
        )
    }

    func downloadSharedSchedulePdf(mode: String, anchorIso: String) async throws -> SharedSchedulePdf {
        guard let token = tokenProvider(), !token.isEmpty else {
            throw ConvexException(code: "UNAUTHORIZED", message: "Bạn cần đăng nhập để xem lịch công tác chung.")
        }
        var components = URLComponents(string: "\(ConvexConfig.webURL)/api/duties/shared-schedule.pdf")
        components?.queryItems = [
            URLQueryItem(name: "mode", value: mode),
            URLQueryItem(name: "anchor", value: anchorIso),
        ]
        guard let url = components?.url else {
            throw ConvexException(code: "SHARED_SCHEDULE_FAILED", message: "Không tải được lịch công tác chung. Hãy thử lại.")
        }
        var request = URLRequest(url: url)
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.cachePolicy = .reloadIgnoringLocalCacheData
        request.timeoutInterval = 180
        let configuration = URLSessionConfiguration.ephemeral
        configuration.timeoutIntervalForRequest = 180
        configuration.timeoutIntervalForResource = 240
        let (temporaryURL, response) = try await URLSession(configuration: configuration).download(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw ConvexException(code: "SHARED_SCHEDULE_FAILED", message: "Không tải được lịch công tác chung. Hãy thử lại.")
        }
        if http.statusCode == 401 || http.statusCode == 403 {
            throw ConvexException(code: "FORBIDDEN", message: "Bạn không có quyền xem lịch công tác chung.")
        }
        guard (200..<300).contains(http.statusCode) else {
            throw ConvexException(code: "SHARED_SCHEDULE_FAILED", message: "Không tải được lịch công tác chung. Hãy thử lại.")
        }
        let fileName = contentDispositionFileName(http.value(forHTTPHeaderField: "Content-Disposition")) ?? "LCT.pdf"
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent("lvt-shared-duty-pdfs", isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let destination = directory.appendingPathComponent(fileName)
        if FileManager.default.fileExists(atPath: destination.path) {
            try FileManager.default.removeItem(at: destination)
        }
        try FileManager.default.moveItem(at: temporaryURL, to: destination)
        let attributes = try FileManager.default.attributesOfItem(atPath: destination.path)
        let size = (attributes[.size] as? NSNumber)?.intValue ?? 0
        guard size > 0 else {
            try? FileManager.default.removeItem(at: destination)
            throw ConvexException(code: "SHARED_SCHEDULE_FAILED", message: "Không tải được lịch công tác chung. Hãy thử lại.")
        }
        return SharedSchedulePdf(url: destination, fileName: fileName)
    }

    private static func decodeDuty(_ value: [String: Any]) -> DutyItem? {
        let id = (value["_id"] as? String) ?? ""
        guard !id.isEmpty else { return nil }
        let timing = value["timing"] as? [String: Any] ?? [:]
        let departmentParticipants = (value["departmentParticipants"] as? [[String: Any]] ?? [])
            .compactMap { row -> DutyDepartmentParticipants? in
                let name = ((row["departmentName"] as? String) ?? "")
                    .trimmingCharacters(in: .whitespacesAndNewlines)
                guard !name.isEmpty else { return nil }
                return DutyDepartmentParticipants(
                    departmentName: name,
                    participantNames: (row["participantNames"] as? [String]) ?? []
                )
            }
        return DutyItem(
            id: id,
            content: (value["content"] as? String) ?? "",
            startDate: (value["startDate"] as? String) ?? "",
            endDate: (value["endDate"] as? String) ?? "",
            startTime: (value["startTime"] as? String) ?? "",
            endTime: (value["endTime"] as? String) ?? "",
            allDay: (value["allDay"] as? Bool) ?? false,
            locationNames: (value["locationNames"] as? [String]) ?? [],
            departmentNames: (value["departmentNames"] as? [String]) ?? [],
            departmentParticipants: departmentParticipants,
            participantNames: (value["participantNames"] as? [String]) ?? [],
            myStatus: (value["myStatus"] as? String) ?? "pending",
            isMine: (value["isMine"] as? Bool) ?? false,
            isOngoing: (timing["isOngoing"] as? Bool) ?? false,
            isOverdue: (timing["isOverdue"] as? Bool) ?? false,
            isUpcoming: (timing["isUpcoming"] as? Bool) ?? false,
            canMarkAttendance: (timing["canMarkAttendance"] as? Bool) ?? false,
            title: (value["title"] as? String) ?? "",
            createdBy: (value["createdBy"] as? String) ?? "",
            locationText: (value["locationText"] as? String) ?? "",
            otherParticipants: (value["otherParticipants"] as? String) ?? ""
        )
    }
}

private func contentDispositionFileName(_ header: String?) -> String? {
    let value = header?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    guard !value.isEmpty else { return nil }
    let nsValue = value as NSString
    let fullRange = NSRange(location: 0, length: nsValue.length)
    if let utf = try? NSRegularExpression(pattern: "filename\\*=UTF-8''([^;]+)", options: .caseInsensitive),
       let match = utf.firstMatch(in: value, options: [], range: fullRange),
       match.numberOfRanges > 1 {
        let encoded = nsValue.substring(with: match.range(at: 1))
        if let decoded = encoded.removingPercentEncoding, !decoded.isEmpty {
            return decoded
        }
    }
    if let plain = try? NSRegularExpression(pattern: "filename=\"?([^\";]+)\"?", options: .caseInsensitive),
       let match = plain.firstMatch(in: value, options: [], range: fullRange),
       match.numberOfRanges > 1 {
        let raw = nsValue.substring(with: match.range(at: 1)).trimmingCharacters(in: .whitespacesAndNewlines)
        return raw.isEmpty ? nil : raw
    }
    return nil
}
