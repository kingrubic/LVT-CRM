import Foundation

struct WorkFormDepartment: Equatable, Sendable {
    let id: String
    let name: String
}

struct WorkFormUser: Equatable, Sendable {
    let id: String
    let name: String
    let departmentName: String
    let level: Int
}

struct WorkFormOptions: Equatable, Sendable {
    let canCreate: Bool
    let isOps: Bool
    let departments: [WorkFormDepartment]
    let users: [WorkFormUser]
}

struct WorkCreateAssignment: Equatable {
    var type: String
    var departmentId: String
    var userIds: [String]
    var content: String
    var deadline: String

    var isIndividual: Bool { type == "individual" }

    static func department() -> WorkCreateAssignment {
        WorkCreateAssignment(type: "department", departmentId: "", userIds: [], content: "", deadline: "")
    }

    static func individual() -> WorkCreateAssignment {
        WorkCreateAssignment(type: "individual", departmentId: "", userIds: [], content: "", deadline: "")
    }
}

enum WorkCreatePolicy {
    static func validate(title: String, assignments: [WorkCreateAssignment]) -> String? {
        let trimmed = title.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty || trimmed.count > 200 {
            return "Vui lòng nhập tên công việc (tối đa 200 ký tự)."
        }
        if assignments.isEmpty {
            return "Vui lòng thêm ít nhất một phân công."
        }
        for (index, row) in assignments.enumerated() {
            let label = "Phân công \(index + 1)"
            if row.isIndividual {
                if row.userIds.allSatisfy({ $0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }) {
                    return "\(label): chọn người nhận."
                }
            } else if row.departmentId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                return "\(label): chọn phòng ban."
            }
            let content = row.content.trimmingCharacters(in: .whitespacesAndNewlines)
            if content.isEmpty || content.count > 2000 {
                return "\(label): nhập nội dung công việc (tối đa 2000 ký tự)."
            }
            if row.deadline.range(of: #"^\d{4}-\d{2}-\d{2}$"#, options: .regularExpression) == nil {
                return "\(label): chọn hạn chót."
            }
        }
        return nil
    }

    static func formatDeadline(_ date: Date) -> String {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(secondsFromGMT: 7 * 3600) ?? .current
        let parts = calendar.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", parts.year ?? 0, parts.month ?? 0, parts.day ?? 0)
    }
}
