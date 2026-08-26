package lvt.crm.ui.profile

data class AppChangelogEntry(
    val version: String,
    val highlights: List<String>,
)

object AppChangelog {
    val entries: List<AppChangelogEntry> = listOf(
        AppChangelogEntry(
            "0.13.0",
            listOf("Tạo công việc ngay trên ứng dụng, giống trên web."),
        ),
        AppChangelogEntry(
            "0.12.0",
            listOf("Thêm mục Lịch sử thay đổi trong tab Cá nhân."),
        ),
        AppChangelogEntry(
            "0.11.0",
            listOf("Mở ứng dụng sẽ yêu cầu cập nhật khi Play có bản mới hơn."),
        ),
        AppChangelogEntry(
            "0.10.0",
            listOf("Công việc: tab Việc cần làm, Đang chờ duyệt, Quá hạn và Đã duyệt hoàn thành."),
        ),
        AppChangelogEntry(
            "0.9.0",
            listOf("Công việc thêm tab Chưa đến hạn và Đã quá hạn."),
        ),
        AppChangelogEntry(
            "0.8.2",
            listOf("Hiện số việc chưa xong trên các tab Công việc."),
        ),
        AppChangelogEntry(
            "0.8.1",
            listOf("Danh sách Công việc chia theo trạng thái hoàn thành."),
        ),
        AppChangelogEntry(
            "0.8.0",
            listOf("Có thể gửi ghi chú khi nộp hoàn thành công việc."),
        ),
    )

    fun visibleEntries(currentVersion: String): List<AppChangelogEntry> =
        entries.filter { compareVersions(it.version, currentVersion) <= 0 }
}

fun compareVersions(left: String, right: String): Int {
    val leftParts = versionParts(left)
    val rightParts = versionParts(right)
    val size = maxOf(leftParts.size, rightParts.size)
    for (index in 0 until size) {
        val delta = leftParts.getOrElse(index) { 0 }.compareTo(rightParts.getOrElse(index) { 0 })
        if (delta != 0) return delta
    }
    return 0
}

private fun versionParts(version: String): List<Int> =
    version.split('.').map { it.toIntOrNull() ?: 0 }
