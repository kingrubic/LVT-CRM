import SwiftUI

struct WorkScreen: View {
    @ObservedObject var viewModel: WorkViewModel
    var focusId: String?
    var tabOpenToken: Int

    @State private var selectedDocument: WorkApprovalItem?
    @State private var confirmApproval: (WorkApprovalItem, Bool)?
    @State private var confirmComplete: WorkTaskItem?
    @State private var reviewTarget: WorkCompletionReviewItem?
    @State private var reviewApprove = true
    @State private var reviewQuality = "100"
    @State private var reviewReason = ""

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(spacing: 14) {
                    header
                    if let error = viewModel.error {
                        ErrorPanel(message: error) { viewModel.refresh() }
                    } else if viewModel.loading {
                        ProgressView().padding(.top, 40)
                    } else {
                        if let actionError = viewModel.actionError {
                            Text(actionError).font(.footnote).foregroundStyle(LvtColors.torchRed)
                        }
                        if viewModel.isAdmin && !viewModel.completionReviews.isEmpty {
                            completionBanner
                        }
                        if viewModel.canApprove {
                            approvalsSection
                        }
                        if !viewModel.isAdmin || viewModel.adminFilter != .pendingCompletion {
                            tasksSection
                        }
                        if viewModel.isAdmin && viewModel.adminFilter == .pendingCompletion {
                            reviewsSection
                        }
                    }
                }
                .padding(16)
            }
            .refreshable { viewModel.refresh() }
            .onChange(of: focusId) { _, newValue in
                guard let newValue else { return }
                withAnimation { proxy.scrollTo(newValue, anchor: .center) }
                if let doc = viewModel.approvals.first(where: {
                    $0.id == newValue || $0.assignments.contains(where: { $0.id == newValue })
                }) {
                    selectedDocument = doc
                }
            }
            .onChange(of: tabOpenToken) { _, _ in
                if focusId == nil {
                    withAnimation {
                        proxy.scrollTo(viewModel.visibleApprovals.first?.id
                            ?? viewModel.visibleTasks.first?.id, anchor: .top)
                    }
                }
            }
            .sheet(item: $selectedDocument) { document in
                AdminDocumentDetail(
                    document: document,
                    reviews: viewModel.completionReviews.filter { review in
                        document.assignments.contains { $0.members.contains { $0.id == review.userId } }
                            || true
                    },
                    busyReviewId: viewModel.busyReviewId,
                    onReview: { review in
                        reviewTarget = review
                        reviewApprove = true
                        reviewQuality = "100"
                        reviewReason = ""
                    }
                )
            }
            .alert(
                confirmApproval?.1 == true ? "Duyệt công văn?" : "Từ chối công văn?",
                isPresented: Binding(
                    get: { confirmApproval != nil },
                    set: { if !$0 { confirmApproval = nil } }
                )
            ) {
                Button("Huỷ", role: .cancel) { confirmApproval = nil }
                Button(confirmApproval?.1 == true ? "Duyệt" : "Từ chối", role: confirmApproval?.1 == true ? nil : .destructive) {
                    if let pair = confirmApproval {
                        viewModel.decideApproval(pair.0, approve: pair.1)
                    }
                    confirmApproval = nil
                }
            } message: {
                Text("Thao tác này không thể hoàn tác.")
            }
            .alert(
                "Hoàn thành công việc?",
                isPresented: Binding(
                    get: { confirmComplete != nil },
                    set: { if !$0 { confirmComplete = nil } }
                )
            ) {
                Button("Huỷ", role: .cancel) { confirmComplete = nil }
                Button("Hoàn thành") {
                    if let task = confirmComplete {
                        viewModel.requestComplete(task)
                    }
                    confirmComplete = nil
                }
            }
            .alert(
                "Phần trăm chất lượng",
                isPresented: Binding(
                    get: { viewModel.qualityPromptTask != nil },
                    set: { if !$0 { viewModel.qualityPromptTask = nil } }
                )
            ) {
                TextField("0–100", text: $viewModel.qualityInput)
                    .keyboardType(.numberPad)
                Button("Huỷ", role: .cancel) { viewModel.qualityPromptTask = nil }
                Button("Xác nhận") { viewModel.confirmQuality() }
            }
            .sheet(item: $reviewTarget) { review in
                reviewSheet(review)
            }
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionHeader(
                title: "Công việc",
                subtitle: viewModel.isAdmin ? "Quản trị công văn & nhiệm vụ" : "Nhiệm vụ và phê duyệt của bạn"
            )
            if viewModel.isAdmin {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack {
                        ForEach(WorkViewModel.AdminFilter.allCases) { filter in
                            Button(filter.title) { viewModel.adminFilter = filter }
                                .font(.caption.weight(.semibold))
                                .padding(.horizontal, 12)
                                .padding(.vertical, 8)
                                .glassEffect(
                                    viewModel.adminFilter == filter
                                        ? .regular.interactive().tint(LvtColors.schoolIndigo.opacity(0.22))
                                        : .regular,
                                    in: .capsule
                                )
                        }
                    }
                }
            } else {
                Toggle("Chỉ việc chờ xử lý", isOn: $viewModel.pendingOnly)
                    .toggleStyle(.button)
                    .buttonStyle(.glass)
            }
        }
    }

    private var completionBanner: some View {
        Button {
            viewModel.adminFilter = .pendingCompletion
        } label: {
            HStack {
                Image(systemName: "exclamationmark.bubble")
                Text("\(viewModel.completionReviews.count) hoàn thành chờ xác nhận")
                    .fontWeight(.semibold)
                Spacer()
            }
            .padding(14)
            .glassEffect(.regular.tint(LvtColors.torchRed.opacity(0.15)), in: .rect(cornerRadius: 18))
        }
        .buttonStyle(.plain)
    }

    private var approvalsSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(viewModel.isAdmin ? "Công văn" : "Chờ duyệt")
                .font(.headline)
                .foregroundStyle(LvtColors.schoolIndigo)
            if viewModel.visibleApprovals.isEmpty {
                EmptyStatePanel(title: "Không có công văn", message: "Danh sách phê duyệt trống.")
            } else {
                ForEach(viewModel.visibleApprovals) { approval in
                    approvalCard(approval)
                        .id(approval.id)
                        .overlay {
                            if focusId == approval.id
                                || approval.assignments.contains(where: { $0.id == focusId }) {
                                RoundedRectangle(cornerRadius: 22)
                                    .stroke(LvtColors.schoolIndigo, lineWidth: 2)
                            }
                        }
                }
            }
        }
    }

    private var tasksSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Nhiệm vụ")
                .font(.headline)
                .foregroundStyle(LvtColors.schoolIndigo)
            if viewModel.visibleTasks.isEmpty {
                EmptyStatePanel(title: "Không có nhiệm vụ", message: "Bạn chưa được giao việc.")
            } else {
                ForEach(viewModel.visibleTasks) { task in
                    taskCard(task)
                        .id(task.id)
                        .overlay {
                            if focusId == task.id {
                                RoundedRectangle(cornerRadius: 22)
                                    .stroke(LvtColors.schoolIndigo, lineWidth: 2)
                            }
                        }
                }
            }
        }
    }

    private var reviewsSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Chờ xác nhận hoàn thành")
                .font(.headline)
                .foregroundStyle(LvtColors.schoolIndigo)
            ForEach(viewModel.completionReviews) { review in
                GlassCard {
                    VStack(alignment: .leading, spacing: 8) {
                        Text(review.userName).font(.headline)
                        Text(review.content).font(.subheadline)
                        Text("\(review.departmentName) · \(review.deadline)")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        HStack {
                            Button("Duyệt") {
                                reviewTarget = review
                                reviewApprove = true
                            }
                            .buttonStyle(.glassProminent)
                            .tint(LvtColors.teal)
                            Button("Từ chối") {
                                reviewTarget = review
                                reviewApprove = false
                            }
                            .buttonStyle(.glass)
                        }
                        .disabled(viewModel.busyReviewId == review.id)
                    }
                }
                .id(review.workItemId)
            }
        }
    }

    private func approvalCard(_ approval: WorkApprovalItem) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                StatusPill(
                    text: approval.status == "pending" ? "Chờ duyệt" : approval.status,
                    tone: approval.status == "pending" ? .warning : .success
                )
                Spacer()
                Text("\(approval.approvalCount)/\(approval.approvalTotal)")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
            }
            Text(approval.fileName.isEmpty ? approval.content : approval.fileName)
                .font(.headline)
                .foregroundStyle(LvtColors.ink)
            if !approval.content.isEmpty && !approval.fileName.isEmpty {
                Text(approval.content)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .lineLimit(3)
            }
            Text("Hạn: \(approval.deadline)")
                .font(.caption)
                .foregroundStyle(LvtColors.schoolIndigo)

            if viewModel.isAdmin {
                Button("Xem phân công") { selectedDocument = approval }
                    .buttonStyle(.glass)
            } else if approval.myDecision.isEmpty {
                HStack {
                    Button("Duyệt") { confirmApproval = (approval, true) }
                        .buttonStyle(.glassProminent)
                        .tint(LvtColors.teal)
                    Button("Từ chối") { confirmApproval = (approval, false) }
                        .buttonStyle(.glass)
                }
                .disabled(viewModel.busyApprovalId == approval.id)
            } else {
                StatusPill(
                    text: approval.myDecision == "approved" ? "Bạn đã duyệt" : "Bạn đã từ chối",
                    tone: approval.myDecision == "approved" ? .success : .danger
                )
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .glassEffect(.regular, in: .rect(cornerRadius: 22))
    }

    private func taskCard(_ task: WorkTaskItem) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                StatusPill(text: taskStatusLabel(task.status), tone: taskStatusTone(task.status))
                Spacer()
                if let percent = task.qualityPercent {
                    StatusPill(text: "\(percent)%", tone: .accent)
                }
            }
            Text(task.title)
                .font(.headline)
                .foregroundStyle(LvtColors.ink)
            if !task.documentContent.isEmpty {
                Text(task.documentContent)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
            }
            Text("\(task.departmentName) · Hạn \(task.deadline)")
                .font(.caption)
                .foregroundStyle(.secondary)
            if !task.rejectionReason.isEmpty {
                Text("Lý do từ chối: \(task.rejectionReason)")
                    .font(.caption)
                    .foregroundStyle(LvtColors.torchRed)
            }
            if WorkHelpers.needsCompletion(task.status) {
                Button("Hoàn thành") {
                    if task.isAdmin {
                        viewModel.requestComplete(task)
                    } else {
                        confirmComplete = task
                    }
                }
                .buttonStyle(.glassProminent)
                .tint(LvtColors.schoolIndigo)
                .disabled(viewModel.busyTaskId == task.id)
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .glassEffect(.regular, in: .rect(cornerRadius: 22))
    }

    private func reviewSheet(_ review: WorkCompletionReviewItem) -> some View {
        NavigationStack {
            Form {
                Section("Xác nhận hoàn thành") {
                    Text(review.userName)
                    Text(review.content)
                    Text("Hạn: \(review.deadline)")
                }
                Section {
                    Toggle("Duyệt", isOn: $reviewApprove)
                    if reviewApprove {
                        TextField("Chất lượng %", text: $reviewQuality)
                            .keyboardType(.numberPad)
                    } else {
                        TextField("Lý do từ chối", text: $reviewReason, axis: .vertical)
                            .lineLimit(3...6)
                    }
                }
            }
            .scrollContentBackground(.hidden)
            .background(AmbientBackground())
            .navigationTitle("Đánh giá")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Huỷ") { reviewTarget = nil }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Gửi") {
                        if reviewApprove {
                            let value = Int(reviewQuality) ?? -1
                            guard (0...100).contains(value) else {
                                viewModel.setActionError("Phần trăm chất lượng phải từ 0 đến 100.")
                                return
                            }
                            viewModel.reviewCompletion(review, approve: true, qualityPercent: value)
                        } else {
                            guard !reviewReason.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
                                viewModel.setActionError("Cần nhập lý do từ chối.")
                                return
                            }
                            viewModel.reviewCompletion(
                                review,
                                approve: false,
                                rejectionReason: reviewReason
                            )
                        }
                        reviewTarget = nil
                    }
                    .disabled(viewModel.busyReviewId == review.id)
                }
            }
        }
        .presentationDetents([.medium])
    }

    private func taskStatusLabel(_ status: String) -> String {
        switch status {
        case "pending_task", "pending": return "Chờ làm"
        case "overdue": return "Quá hạn"
        case "pending_completion": return "Chờ xác nhận"
        case "completed": return "Hoàn thành"
        case "rejected", "rejected_completion": return "Bị từ chối"
        default: return status
        }
    }

    private func taskStatusTone(_ status: String) -> StatusPill.Tone {
        switch status {
        case "completed": return .success
        case "overdue", "rejected", "rejected_completion": return .danger
        case "pending_completion": return .warning
        default: return .accent
        }
    }
}

struct AdminDocumentDetail: View {
    let document: WorkApprovalItem
    let reviews: [WorkCompletionReviewItem]
    let busyReviewId: String?
    var onReview: (WorkCompletionReviewItem) -> Void

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    Text(document.fileName.isEmpty ? document.content : document.fileName)
                        .font(.title3.weight(.semibold))
                    Text(document.content)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                    Text("Hạn: \(document.deadline) · \(document.approvalCount)/\(document.approvalTotal)")
                        .font(.caption)
                        .foregroundStyle(LvtColors.schoolIndigo)

                    ForEach(groupedAssignments, id: \.0) { department, assignments in
                        VStack(alignment: .leading, spacing: 8) {
                            Text(department)
                                .font(.headline)
                                .foregroundStyle(LvtColors.schoolIndigo)
                            ForEach(assignments) { assignment in
                                GlassCard {
                                    VStack(alignment: .leading, spacing: 6) {
                                        Text(assignment.content).font(.subheadline)
                                        Text("Hạn \(assignment.deadline)")
                                            .font(.caption)
                                            .foregroundStyle(.secondary)
                                        ForEach(assignment.members) { member in
                                            HStack {
                                                Text(member.name)
                                                Spacer()
                                                StatusPill(
                                                    text: member.status,
                                                    tone: member.status.contains("complete") ? .success : .neutral
                                                )
                                            }
                                            .font(.caption)
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
                .padding(20)
            }
            .background(AmbientBackground())
            .navigationTitle("Chi tiết công văn")
            .navigationBarTitleDisplayMode(.inline)
        }
    }

    private var groupedAssignments: [(String, [WorkDocumentAssignment])] {
        Dictionary(grouping: document.assignments, by: \.departmentName)
            .map { ($0.key, $0.value) }
            .sorted { $0.0 < $1.0 }
    }
}
