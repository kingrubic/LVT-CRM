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
}

struct DutiesSnapshot: Equatable, Sendable {
    let attendanceConfirmationEnabled: Bool
    let duties: [DutyItem]
    let canCreate: Bool
    let isAdmin: Bool
    let canViewAll: Bool
}

final class DutiesRepository: Sendable {
    private let convex: ConvexHttpClient

    init(convex: ConvexHttpClient) {
        self.convex = convex
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
            createdBy: (value["createdBy"] as? String) ?? ""
        )
    }
}
