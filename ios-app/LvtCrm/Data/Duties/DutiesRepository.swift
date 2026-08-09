import Foundation

struct DutyDepartmentParticipants: Identifiable, Equatable, Sendable {
    var id: String { departmentName }
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
}

struct DutiesSnapshot: Equatable, Sendable {
    let attendanceConfirmationEnabled: Bool
    let duties: [DutyItem]
}

final class DutiesRepository: Sendable {
    private let convex: ConvexHttpClient

    init(convex: ConvexHttpClient) {
        self.convex = convex
    }

    func listMine() async throws -> DutiesSnapshot {
        let result = try await convex.query("duties:listMine")
        let array = result["duties"] as? [[String: Any]] ?? []
        let duties = array.compactMap { d -> DutyItem? in
            let id = (d["_id"] as? String) ?? ""
            guard !id.isEmpty else { return nil }
            let timing = d["timing"] as? [String: Any] ?? [:]
            let deptParticipants = (d["departmentParticipants"] as? [[String: Any]] ?? []).compactMap { row -> DutyDepartmentParticipants? in
                let name = ((row["departmentName"] as? String) ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
                guard !name.isEmpty else { return nil }
                return DutyDepartmentParticipants(
                    departmentName: name,
                    participantNames: (row["participantNames"] as? [String]) ?? []
                )
            }
            return DutyItem(
                id: id,
                content: (d["content"] as? String) ?? "",
                startDate: (d["startDate"] as? String) ?? "",
                endDate: (d["endDate"] as? String) ?? "",
                startTime: (d["startTime"] as? String) ?? "",
                endTime: (d["endTime"] as? String) ?? "",
                allDay: (d["allDay"] as? Bool) ?? false,
                locationNames: (d["locationNames"] as? [String]) ?? [],
                departmentNames: (d["departmentNames"] as? [String]) ?? [],
                departmentParticipants: deptParticipants,
                participantNames: (d["participantNames"] as? [String]) ?? [],
                myStatus: (d["myStatus"] as? String) ?? "pending",
                isMine: (d["isMine"] as? Bool) ?? false,
                isOngoing: (timing["isOngoing"] as? Bool) ?? false,
                isOverdue: (timing["isOverdue"] as? Bool) ?? false,
                isUpcoming: (timing["isUpcoming"] as? Bool) ?? false,
                canMarkAttendance: (timing["canMarkAttendance"] as? Bool) ?? false
            )
        }
        return DutiesSnapshot(
            attendanceConfirmationEnabled: (result["attendanceConfirmationEnabled"] as? Bool) ?? false,
            duties: duties
        )
    }

    func setAttendance(dutyId: String, status: String) async throws {
        _ = try await convex.mutation(
            "duties:setAttendance",
            args: ["dutyId": dutyId, "status": status]
        )
    }
}
