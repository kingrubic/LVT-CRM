import Foundation

struct DutyScheduleRange: Equatable {
    let mode: String
    let startIso: String
    let endIso: String
    let title: String

    var filename: String {
        "LCT tu \(formatDayMonth(startIso).replacingOccurrences(of: "/", with: "."))-\(formatDayMonth(endIso).replacingOccurrences(of: "/", with: ".")).pdf"
    }

    var shortLabel: String {
        "\(formatVnDate(startIso)) – \(formatVnDate(endIso))"
    }
}

enum DutyScheduleCalendar {
    static func todayIso(_ date: Date = Date(), calendar: Calendar = .current) -> String {
        toIsoDate(date, calendar: calendar)
    }

    static func scheduleRange(mode: String, anchorIso: String, calendar: Calendar = .current) -> DutyScheduleRange {
        let anchor = fromIsoDate(anchorIso, calendar: calendar)
        if mode == "month" {
            let start = calendar.date(from: calendar.dateComponents([.year, .month], from: anchor)) ?? anchor
            let dayCount = calendar.range(of: .day, in: .month, for: start)?.count ?? 1
            let end = calendar.date(byAdding: .day, value: dayCount - 1, to: start) ?? start
            let startIso = toIsoDate(start, calendar: calendar)
            let endIso = toIsoDate(end, calendar: calendar)
            return DutyScheduleRange(
                mode: "month",
                startIso: startIso,
                endIso: endIso,
                title: "LỊCH CÔNG TÁC TỪ NGÀY \(formatVnDate(startIso)) ĐẾN \(formatVnDate(endIso))"
            )
        }
        let start = startOfWeekMonday(anchor, calendar: calendar)
        let end = calendar.date(byAdding: .day, value: 5, to: start) ?? start
        let startIso = toIsoDate(start, calendar: calendar)
        let endIso = toIsoDate(end, calendar: calendar)
        return DutyScheduleRange(
            mode: "week",
            startIso: startIso,
            endIso: endIso,
            title: "LỊCH CÔNG TÁC TỪ NGÀY \(formatVnDate(startIso)) ĐẾN \(formatVnDate(endIso))"
        )
    }

    static func shiftScheduleAnchor(mode: String, anchorIso: String, direction: Int, calendar: Calendar = .current) -> String {
        let anchor = fromIsoDate(anchorIso, calendar: calendar)
        if mode == "month" {
            let start = calendar.date(from: calendar.dateComponents([.year, .month], from: anchor)) ?? anchor
            let shifted = calendar.date(byAdding: .month, value: direction, to: start) ?? start
            return toIsoDate(shifted, calendar: calendar)
        }
        let start = startOfWeekMonday(anchor, calendar: calendar)
        let shifted = calendar.date(byAdding: .day, value: direction * 7, to: start) ?? start
        return toIsoDate(shifted, calendar: calendar)
    }
}

private func startOfWeekMonday(_ date: Date, calendar: Calendar) -> Date {
    let day = calendar.startOfDay(for: date)
    let weekday = calendar.component(.weekday, from: day)
    let delta = weekday == 1 ? -6 : 2 - weekday
    return calendar.date(byAdding: .day, value: delta, to: day) ?? day
}

private func fromIsoDate(_ value: String, calendar: Calendar) -> Date {
    let parts = value.split(separator: "-").compactMap { Int($0) }
    guard parts.count == 3 else { return Date() }
    var components = DateComponents()
    components.year = parts[0]
    components.month = parts[1]
    components.day = parts[2]
    return calendar.date(from: components) ?? Date()
}

private func toIsoDate(_ date: Date, calendar: Calendar) -> String {
    let parts = calendar.dateComponents([.year, .month, .day], from: date)
    return String(format: "%04d-%02d-%02d", parts.year ?? 0, parts.month ?? 0, parts.day ?? 0)
}

private func formatDayMonth(_ isoDate: String) -> String {
    let parts = isoDate.split(separator: "-").map(String.init)
    guard parts.count == 3, let month = Int(parts[1]) else { return "" }
    return "\(parts[2])/\(month)"
}

private func formatVnDate(_ isoDate: String) -> String {
    let parts = isoDate.split(separator: "-").map(String.init)
    guard parts.count == 3, let month = Int(parts[1]) else { return "" }
    return "\(parts[2])/\(month)/\(parts[0])"
}
