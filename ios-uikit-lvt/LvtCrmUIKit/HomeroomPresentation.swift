import Foundation

/// Visual meaning of a chip or stat tile; mapped to DESIGN.md status colors in the UI layer.
enum HomeroomTone: Equatable, Sendable { case success, warning, danger, neutral, info }

struct HomeroomChip: Equatable, Sendable {
    let text: String
    let tone: HomeroomTone
}

struct HomeroomStat: Equatable, Sendable {
    let value: String
    let label: String
    let tone: HomeroomTone
}

/// Teacher-facing wording and status summaries for Lớp chủ nhiệm (Foundation only, so it is checkable offline).
enum HomeroomPresentation {
    private static let absentStatuses: Set<String> = ["absent_pending", "absent_excused", "absent_unexcused"]
    private static let vietnamese = Locale(identifier: "vi_VN")

    static func number(_ value: Int) -> String {
        let formatter = NumberFormatter()
        formatter.locale = vietnamese
        formatter.numberStyle = .decimal
        formatter.groupingSeparator = "."
        return formatter.string(from: NSNumber(value: value)) ?? String(value)
    }

    static func classTitle(_ row: HomeroomClassSummary) -> String {
        row.name.isEmpty ? "Lớp \(row.code)" : row.name
    }

    static func classSubtitle(_ row: HomeroomClassSummary) -> String {
        "\(row.rosterCount) HS · \(row.teacherName.isEmpty ? "Chưa có GVCN" : row.teacherName)"
    }

    /// One main status chip plus a pending chip; no chips on days that need no attendance.
    static func classChips(_ row: HomeroomClassSummary, schoolDay: Bool) -> [HomeroomChip] {
        guard schoolDay else { return [] }
        guard row.published else { return [HomeroomChip(text: "Chưa điểm danh", tone: .neutral)] }
        let counts = row.counts
        let main: HomeroomChip
        if counts.absent > 0 {
            main = HomeroomChip(text: "\(counts.absent) vắng", tone: .danger)
        } else if counts.late > 0 {
            main = HomeroomChip(text: "\(counts.late) trễ", tone: .warning)
        } else if counts.noData > 0 {
            main = HomeroomChip(text: "\(counts.noData) chưa có", tone: .neutral)
        } else {
            main = HomeroomChip(text: "Đủ \(counts.present + counts.exempt)/\(row.rosterCount)", tone: .success)
        }
        return row.pendingTotal > 0 ? [main, HomeroomChip(text: "\(row.pendingTotal) chờ", tone: .warning)] : [main]
    }

    static func overviewStats(_ counts: AttendanceCounts) -> [HomeroomStat] {
        [
            HomeroomStat(value: number(counts.present), label: "Có mặt", tone: .success),
            HomeroomStat(value: number(counts.late), label: "Trễ", tone: .warning),
            HomeroomStat(value: number(counts.absent), label: "Vắng", tone: .danger),
            HomeroomStat(value: number(counts.noData), label: "Chưa có", tone: .neutral),
        ]
    }

    static func overviewSummary(studentCount: Int, classCount: Int, attendanceRate: Double, ratedRows: Int) -> String {
        let base = "\(number(classCount)) lớp · \(number(studentCount)) học sinh"
        guard ratedRows > 0 else { return base }
        let rate = String(format: "%.1f", attendanceRate * 100).replacingOccurrences(of: ".", with: ",")
        return "Chuyên cần \(rate)% · \(base)"
    }

    /// "Thứ Sáu, 09/10" for a YYYY-MM-DD date; falls back to the raw value when it does not parse.
    static func dayTitle(_ isoDate: String) -> String {
        guard let date = VietnamDate.date(from: isoDate) else { return isoDate }
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = VietnamDate.timeZone
        let parts = calendar.dateComponents([.weekday, .day, .month], from: date)
        let names = ["Chủ Nhật", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy"]
        let weekday = names[max(0, min(6, (parts.weekday ?? 1) - 1))]
        return String(format: "%@, %02d/%02d", weekday, parts.day ?? 0, parts.month ?? 0)
    }

    static func shiftDay(_ isoDate: String, by days: Int) -> String {
        guard let date = VietnamDate.date(from: isoDate) else { return isoDate }
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = VietnamDate.timeZone
        guard let shifted = calendar.date(byAdding: .day, value: days, to: date) else { return isoDate }
        return VietnamDate.string(from: shifted)
    }

    static func studentChip(status: String, observedTime: String?) -> HomeroomChip {
        switch status {
        case "present": return HomeroomChip(text: "Có mặt", tone: .success)
        case "late": return HomeroomChip(text: observedTime.map { "Trễ \($0)" } ?? "Trễ", tone: .warning)
        case "exempt": return HomeroomChip(text: "Miễn", tone: .info)
        default:
            return absentStatuses.contains(status) ? HomeroomChip(text: "Vắng", tone: .danger) : HomeroomChip(text: "Chưa có", tone: .neutral)
        }
    }

    /// Có mặt / Trễ / Vắng tiles for a class day; adds Chưa có only when some rows have no data.
    static func dailyStats(_ statuses: [String]) -> [HomeroomStat] {
        let noData = statuses.filter { $0 == "no_data" }.count
        var tiles = [
            HomeroomStat(value: number(statuses.filter { $0 == "present" }.count), label: "Có mặt", tone: .success),
            HomeroomStat(value: number(statuses.filter { $0 == "late" }.count), label: "Trễ", tone: .warning),
            HomeroomStat(value: number(statuses.filter { absentStatuses.contains($0) }.count), label: "Vắng", tone: .danger),
        ]
        if noData > 0 { tiles.append(HomeroomStat(value: number(noData), label: "Chưa có", tone: .neutral)) }
        return tiles
    }

    static func clock(_ milliseconds: Double) -> String {
        let formatter = DateFormatter()
        formatter.timeZone = VietnamDate.timeZone
        formatter.locale = vietnamese
        formatter.dateFormat = "HH:mm"
        return formatter.string(from: Date(timeIntervalSince1970: milliseconds / 1000))
    }
}
