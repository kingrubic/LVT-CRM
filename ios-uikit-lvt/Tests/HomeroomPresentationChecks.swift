import Foundation

@main
struct HomeroomPresentationChecks {
    static func main() {
        func counts(present: Int = 0, late: Int = 0, absent: Int = 0, noData: Int = 0, exempt: Int = 0) -> AttendanceCounts {
            AttendanceCounts(present: present, late: late, absentExcused: 0, absentUnexcused: 0, absentPending: absent, noData: noData, exempt: exempt)
        }
        func klass(_ counts: AttendanceCounts, published: Bool = true, pending: Int = 0, teacher: String = "Lê Thị Cúc", name: String = "Lớp 6-2") -> HomeroomClassSummary {
            HomeroomClassSummary(id: "c1", code: "2627-6-2", name: name, gradeLevel: 6, rosterCount: 41, teacherName: teacher, published: published, counts: counts, pendingTotal: pending, canCorrect: true)
        }
        precondition(HomeroomPresentation.classTitle(klass(counts())) == "Lớp 6-2")
        precondition(HomeroomPresentation.classTitle(klass(counts(), name: "")) == "Lớp 2627-6-2")
        precondition(HomeroomPresentation.classSubtitle(klass(counts())) == "41 HS · Lê Thị Cúc")
        precondition(HomeroomPresentation.classSubtitle(klass(counts(), teacher: "")) == "41 HS · Chưa có GVCN")
        precondition(HomeroomPresentation.classChips(klass(counts(present: 41)), schoolDay: true) == [HomeroomChip(text: "Đủ 41/41", tone: .success)])
        precondition(HomeroomPresentation.classChips(klass(counts(present: 37, late: 1, absent: 3), pending: 2), schoolDay: true)
            == [HomeroomChip(text: "3 vắng", tone: .danger), HomeroomChip(text: "2 chờ", tone: .warning)])
        precondition(HomeroomPresentation.classChips(klass(counts(present: 40, late: 1)), schoolDay: true) == [HomeroomChip(text: "1 trễ", tone: .warning)])
        precondition(HomeroomPresentation.classChips(klass(counts(), published: false), schoolDay: true) == [HomeroomChip(text: "Chưa điểm danh", tone: .neutral)])
        precondition(HomeroomPresentation.classChips(klass(counts(), published: false), schoolDay: false).isEmpty)
        for status in ["absent_pending", "absent_excused", "absent_unexcused"] {
            precondition(HomeroomPresentation.studentChip(status: status, observedTime: nil) == HomeroomChip(text: "Vắng", tone: .danger))
        }
        precondition(HomeroomPresentation.studentChip(status: "late", observedTime: "07:12") == HomeroomChip(text: "Trễ 07:12", tone: .warning))
        precondition(HomeroomPresentation.studentChip(status: "no_data", observedTime: nil) == HomeroomChip(text: "Chưa có", tone: .neutral))
        let stats = HomeroomPresentation.overviewStats(counts(present: 2301, late: 18, absent: 12, noData: 7))
        precondition(stats.map(\.value) == ["2.301", "18", "12", "7"])
        precondition(stats.map(\.label) == ["Có mặt", "Trễ", "Vắng", "Chưa có"])
        precondition(HomeroomPresentation.overviewSummary(studentCount: 2338, classCount: 50, attendanceRate: 0.984, ratedRows: 10) == "Chuyên cần 98,4% · 50 lớp · 2.338 học sinh")
        precondition(HomeroomPresentation.overviewSummary(studentCount: 2338, classCount: 50, attendanceRate: 0, ratedRows: 0) == "50 lớp · 2.338 học sinh")
        precondition(HomeroomPresentation.dailyStats(["present", "late", "absent_pending"]).count == 3)
        precondition(HomeroomPresentation.dailyStats(["present", "no_data"]).last?.label == "Chưa có")
        precondition(HomeroomPresentation.dayTitle("2026-10-09") == "Thứ Sáu, 09/10")
        precondition(HomeroomPresentation.dayTitle("2026-10-11") == "Chủ Nhật, 11/10")
        precondition(HomeroomPresentation.shiftDay("2026-10-09", by: 1) == "2026-10-10")
        precondition(HomeroomPresentation.shiftDay("2026-10-01", by: -1) == "2026-09-30")
        precondition(HomeroomPresentation.dayTitle("not-a-date") == "not-a-date")
        print("HomeroomPresentationChecks passed")
    }
}
