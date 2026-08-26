import Foundation

struct AppChangelogEntry: Equatable {
    let version: String
    let highlights: [String]
}

enum AppChangelog {
    static let entries: [AppChangelogEntry] = [
        AppChangelogEntry(
            version: "1.5.0",
            highlights: ["Tạo công việc ngay trên ứng dụng, giống trên web."]
        ),
        AppChangelogEntry(
            version: "1.4.0",
            highlights: ["Thêm mục Lịch sử thay đổi trong tab Cá nhân."]
        ),
        AppChangelogEntry(
            version: "1.3.0",
            highlights: ["Công việc: tab Việc cần làm, Đang chờ duyệt, Quá hạn và Đã duyệt hoàn thành."]
        ),
        AppChangelogEntry(
            version: "1.2.0",
            highlights: ["Công việc thêm tab Chưa đến hạn và Đã quá hạn."]
        ),
        AppChangelogEntry(
            version: "1.1.2",
            highlights: ["Hiện số việc chưa xong trên các tab Công việc."]
        ),
        AppChangelogEntry(
            version: "1.1.1",
            highlights: ["Danh sách Công việc chia theo trạng thái hoàn thành."]
        ),
        AppChangelogEntry(
            version: "1.1.0",
            highlights: ["Có thể gửi ghi chú khi nộp hoàn thành công việc."]
        ),
        AppChangelogEntry(
            version: "1.0",
            highlights: ["Bản đầu trên App Store: đăng nhập, công tác, công việc và thông báo."]
        ),
    ]

    static func visibleEntries(currentVersion: String) -> [AppChangelogEntry] {
        entries.filter { compareVersions($0.version, currentVersion) <= 0 }
    }
}

func compareVersions(_ left: String, _ right: String) -> Int {
    let leftParts = versionParts(left)
    let rightParts = versionParts(right)
    let size = max(leftParts.count, rightParts.count)
    for index in 0..<size {
        let leftValue = index < leftParts.count ? leftParts[index] : 0
        let rightValue = index < rightParts.count ? rightParts[index] : 0
        if leftValue != rightValue { return leftValue < rightValue ? -1 : 1 }
    }
    return 0
}

private func versionParts(_ version: String) -> [Int] {
    version.split(separator: ".").map { Int($0) ?? 0 }
}
