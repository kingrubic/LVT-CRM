import SwiftUI

struct NotificationsScreen: View {
    @ObservedObject var viewModel: NotificationsViewModel
    var onOpenItem: (NotificationItem) -> Void
    var tabOpenToken: Int

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(spacing: 12) {
                    header
                    if let error = viewModel.error {
                        ErrorPanel(message: error) { viewModel.refresh() }
                    } else if viewModel.loading {
                        ProgressView().padding(.top, 40)
                    } else if viewModel.visibleItems.isEmpty {
                        EmptyStatePanel(
                            title: viewModel.unreadOnly ? "Không có thông báo chưa đọc" : "Chưa có thông báo",
                            message: "Khi có công tác hoặc công việc sắp đến hạn, thông báo sẽ hiện tại đây."
                        )
                    } else {
                        ForEach(viewModel.visibleItems) { item in
                            notificationCard(item)
                                .id(item.key)
                        }
                    }
                }
                .padding(16)
            }
            .refreshable { viewModel.refresh() }
            .onChange(of: tabOpenToken) { _, _ in
                withAnimation { proxy.scrollTo(viewModel.visibleItems.first?.key, anchor: .top) }
            }
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionHeader(
                title: "Thông báo",
                subtitle: milestoneSummary
            )
            HStack {
                Toggle("Chưa đọc", isOn: $viewModel.unreadOnly)
                    .toggleStyle(.button)
                    .buttonStyle(.glass)
                Spacer()
                if viewModel.unreadCount > 0 {
                    Button("Đọc tất cả") { viewModel.markAllRead() }
                        .buttonStyle(.glassProminent)
                        .tint(LvtColors.schoolIndigo)
                        .disabled(viewModel.busyKey != nil)
                }
            }
            if let actionError = viewModel.actionError {
                Text(actionError)
                    .font(.footnote)
                    .foregroundStyle(LvtColors.torchRed)
            }
        }
    }

    private var milestoneSummary: String {
        let hours = viewModel.settings.milestonesHours
        guard !hours.isEmpty else { return "Nhắc hạn công tác & công việc" }
        let labels = hours.map { $0 == 0 ? "Đến hạn" : "Trước \($0)h" }
        return labels.joined(separator: " · ")
    }

    private func notificationCard(_ item: NotificationItem) -> some View {
        Button {
            viewModel.open(item, onOpened: onOpenItem)
        } label: {
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    StatusPill(text: kindLabel(item), tone: item.read ? .neutral : .danger)
                    Spacer()
                    if !item.read {
                        Circle()
                            .fill(LvtColors.torchRed)
                            .frame(width: 8, height: 8)
                    }
                }
                Text(item.title)
                    .font(.headline)
                    .foregroundStyle(LvtColors.ink)
                    .multilineTextAlignment(.leading)
                if !item.description.isEmpty {
                    Text(item.description)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.leading)
                }
                if item.dueAt > 0 {
                    Text(DateFormatters.dueString(from: item.dueAt))
                        .font(.caption)
                        .foregroundStyle(LvtColors.schoolIndigo)
                }
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .glassEffect(
                item.read ? .regular : .regular.tint(LvtColors.torchRed.opacity(0.10)),
                in: .rect(cornerRadius: 22)
            )
        }
        .buttonStyle(.plain)
        .contextMenu {
            if viewModel.canDelete {
                Button("Xoá thông báo", role: .destructive) {
                    viewModel.dismiss(item)
                }
            }
        }
    }

    private func kindLabel(_ item: NotificationItem) -> String {
        if item.sourceType == "completion_rejected" { return "Từ chối hoàn thành" }
        if item.kind == "duty" { return "Công tác" }
        if item.sourceType == "document" || item.sourceType == "approval" {
            return "Công văn cần duyệt"
        }
        return "Công việc"
    }
}
