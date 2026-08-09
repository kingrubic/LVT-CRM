import SwiftUI

struct DutiesScreen: View {
    @ObservedObject var viewModel: DutiesViewModel
    var focusId: String?
    var tabOpenToken: Int
    @State private var selectedDuty: DutyItem?

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(spacing: 12) {
                    SectionHeader(title: "Công tác", subtitle: "Lịch công tác của bạn")
                    if let error = viewModel.error {
                        ErrorPanel(message: error) { viewModel.refresh() }
                    } else if viewModel.loading {
                        ProgressView().padding(.top, 40)
                    } else if viewModel.duties.isEmpty {
                        EmptyStatePanel(
                            title: "Chưa có công tác",
                            message: "Khi được phân công, công tác sẽ xuất hiện tại đây."
                        )
                    } else {
                        if let actionError = viewModel.actionError {
                            Text(actionError)
                                .font(.footnote)
                                .foregroundStyle(LvtColors.torchRed)
                        }
                        ForEach(viewModel.duties) { duty in
                            dutyCard(duty)
                                .id(duty.id)
                                .overlay {
                                    if focusId == duty.id {
                                        RoundedRectangle(cornerRadius: 22)
                                            .stroke(LvtColors.schoolIndigo, lineWidth: 2)
                                    }
                                }
                        }
                    }
                }
                .padding(16)
            }
            .refreshable { viewModel.refresh() }
            .onChange(of: focusId) { _, newValue in
                guard let newValue else { return }
                withAnimation { proxy.scrollTo(newValue, anchor: .center) }
                if let duty = viewModel.duties.first(where: { $0.id == newValue }) {
                    selectedDuty = duty
                }
            }
            .onChange(of: tabOpenToken) { _, _ in
                if focusId == nil {
                    withAnimation { proxy.scrollTo(viewModel.duties.first?.id, anchor: .top) }
                }
            }
            .sheet(item: $selectedDuty) { duty in
                DutyDetailSheet(
                    duty: duty,
                    attendanceEnabled: viewModel.attendanceConfirmationEnabled,
                    busy: viewModel.busyDutyId == duty.id,
                    onAttend: { viewModel.setAttendance(dutyId: duty.id, status: "attended") },
                    onAbsent: { viewModel.setAttendance(dutyId: duty.id, status: "absent") }
                )
                .presentationDetents([.medium, .large])
            }
        }
    }

    private func dutyCard(_ duty: DutyItem) -> some View {
        Button {
            selectedDuty = duty
        } label: {
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    ForEach(timingPills(duty), id: \.0) { pill in
                        StatusPill(text: pill.0, tone: pill.1)
                    }
                    Spacer()
                    StatusPill(text: statusLabel(duty.myStatus), tone: statusTone(duty.myStatus))
                }
                Text(truncated(duty.content, limit: 50))
                    .font(.headline)
                    .foregroundStyle(LvtColors.ink)
                    .multilineTextAlignment(.leading)
                Text(scheduleText(duty))
                    .font(.caption)
                    .foregroundStyle(.secondary)
                if canMark(duty) {
                    HStack {
                        Button("Có mặt") {
                            viewModel.setAttendance(dutyId: duty.id, status: "attended")
                        }
                        .buttonStyle(.glassProminent)
                        .tint(LvtColors.teal)
                        .disabled(viewModel.busyDutyId == duty.id)

                        Button("Vắng") {
                            viewModel.setAttendance(dutyId: duty.id, status: "absent")
                        }
                        .buttonStyle(.glass)
                        .disabled(viewModel.busyDutyId == duty.id)
                    }
                }
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .glassEffect(.regular, in: .rect(cornerRadius: 22))
        }
        .buttonStyle(.plain)
    }

    private func canMark(_ duty: DutyItem) -> Bool {
        viewModel.attendanceConfirmationEnabled && duty.isMine && duty.canMarkAttendance
    }

    private func timingPills(_ duty: DutyItem) -> [(String, StatusPill.Tone)] {
        var pills: [(String, StatusPill.Tone)] = []
        if duty.isOngoing { pills.append(("Đang diễn ra", .success)) }
        if duty.isOverdue { pills.append(("Đã kết thúc", .neutral)) }
        if duty.isUpcoming { pills.append(("Sắp tới", .accent)) }
        return pills
    }

    private func statusLabel(_ status: String) -> String {
        switch status {
        case "attended": return "Có mặt"
        case "absent": return "Vắng"
        default: return "Chưa xác nhận"
        }
    }

    private func statusTone(_ status: String) -> StatusPill.Tone {
        switch status {
        case "attended": return .success
        case "absent": return .danger
        default: return .warning
        }
    }

    private func scheduleText(_ duty: DutyItem) -> String {
        let datePart = duty.startDate == duty.endDate
            ? duty.startDate
            : "\(duty.startDate) → \(duty.endDate)"
        if duty.allDay { return "\(datePart) · Cả ngày" }
        return "\(datePart) · \(duty.startTime)-\(duty.endTime)"
    }

    private func truncated(_ text: String, limit: Int) -> String {
        text.count <= limit ? text : String(text.prefix(limit)) + "…"
    }
}

struct DutyDetailSheet: View {
    let duty: DutyItem
    let attendanceEnabled: Bool
    let busy: Bool
    var onAttend: () -> Void
    var onAbsent: () -> Void

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    Text(duty.content)
                        .font(.title3.weight(.semibold))
                        .foregroundStyle(LvtColors.ink)
                    InfoRow(label: "Thời gian", value: schedule)
                    if !duty.locationNames.isEmpty {
                        InfoRow(label: "Địa điểm", value: duty.locationNames.joined(separator: ", "))
                    }
                    if !duty.departmentNames.isEmpty {
                        InfoRow(label: "Tổ/phòng", value: duty.departmentNames.joined(separator: ", "))
                    }
                    ForEach(duty.departmentParticipants) { row in
                        InfoRow(
                            label: row.departmentName,
                            value: row.participantNames.joined(separator: ", ")
                        )
                    }
                    if !duty.participantNames.isEmpty {
                        InfoRow(label: "Thành phần", value: duty.participantNames.joined(separator: ", "))
                    }
                    if attendanceEnabled && duty.isMine && duty.canMarkAttendance {
                        HStack {
                            Button("Có mặt", action: onAttend)
                                .buttonStyle(.glassProminent)
                                .tint(LvtColors.teal)
                                .disabled(busy)
                            Button("Vắng", action: onAbsent)
                                .buttonStyle(.glass)
                                .disabled(busy)
                        }
                    }
                }
                .padding(20)
            }
            .background(AmbientBackground())
            .navigationTitle("Chi tiết công tác")
            .navigationBarTitleDisplayMode(.inline)
        }
    }

    private var schedule: String {
        let datePart = duty.startDate == duty.endDate
            ? duty.startDate
            : "\(duty.startDate) → \(duty.endDate)"
        if duty.allDay { return "\(datePart) · Cả ngày" }
        return "\(datePart) · \(duty.startTime)-\(duty.endTime)"
    }
}
