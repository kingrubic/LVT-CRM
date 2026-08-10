import SwiftUI

struct DevicesScreen: View {
    let sessionsRepository: SessionsRepository

    @Environment(\.dismiss) private var dismiss
    @State private var sessions: [DeviceSession] = []
    @State private var loading = true
    @State private var pending = false
    @State private var feedback: String?
    private let now = Date().timeIntervalSince1970 * 1000

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    Text("Quản lý phiên đăng nhập. Thu hồi sẽ đăng xuất thiết bị và ngừng nhận thông báo.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)

                    if let feedback {
                        Text(feedback)
                            .font(.footnote)
                            .foregroundStyle(LvtColors.torchRed)
                    }

                    if loading {
                        ProgressView()
                            .frame(maxWidth: .infinity)
                    } else {
                        let current = sessions.first(where: \.isCurrent)
                        let others = sessions.filter { !$0.isCurrent }

                        if let current {
                            sectionHeader("THIẾT BỊ NÀY")
                            sessionCard(current)
                            if !others.isEmpty {
                                Button {
                                    Task { await revokeOthers() }
                                } label: {
                                    Label("Đăng xuất tất cả phiên khác", systemImage: "iphone.slash")
                                        .frame(maxWidth: .infinity)
                                }
                                .buttonStyle(.glass)
                                .disabled(pending)
                            }
                        }

                        sectionHeader("PHIÊN ĐĂNG NHẬP")
                        if others.isEmpty {
                            Text("Không có phiên đăng nhập nào khác.")
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                        } else {
                            ForEach(others) { session in
                                sessionCard(session)
                                Button("Thu hồi", role: .destructive) {
                                    Task { await revoke(session.sessionId) }
                                }
                                .disabled(pending)
                                .frame(maxWidth: .infinity, alignment: .trailing)
                            }
                        }
                    }
                }
                .padding(16)
            }
            .navigationTitle("Thiết bị")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Đóng") { dismiss() }
                }
            }
            .task { await reload() }
        }
    }

    @ViewBuilder
    private func sectionHeader(_ title: String) -> some View {
        Text(title)
            .font(.caption.weight(.semibold))
            .foregroundStyle(.secondary)
            .tracking(1.2)
    }

    private func sessionCard(_ session: DeviceSession) -> some View {
        GlassCard {
            HStack(spacing: 12) {
                Text(emoji(for: session.clientKind))
                    .font(.title2)
                VStack(alignment: .leading, spacing: 3) {
                    Text(session.deviceName)
                        .font(.body.weight(.semibold))
                        .foregroundStyle(LvtColors.ink)
                    Text(session.platformLabel)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Text(session.isCurrent ? "Thiết bị này" : formatActive(session.lastActiveAt))
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
                Spacer()
            }
        }
    }

    private func emoji(for kind: String) -> String {
        switch kind {
        case "android": return "🤖"
        case "web": return "💻"
        case "ios": return "📱"
        default: return "📟"
        }
    }

    private func formatActive(_ timestamp: TimeInterval) -> String {
        guard timestamp > 0 else { return "—" }
        let diff = max(0, now - timestamp)
        if diff < 120_000 { return "trực tuyến" }
        let minutes = Int(diff / 60_000)
        if minutes < 60 { return "\(minutes) phút trước" }
        let hours = minutes / 60
        if hours < 24 { return "\(hours) giờ trước" }
        let days = hours / 24
        if days < 7 { return "\(days) ngày trước" }
        let date = Date(timeIntervalSince1970: timestamp / 1000)
        let formatter = DateFormatter()
        formatter.dateFormat = "dd/MM/yy"
        return formatter.string(from: date)
    }

    private func reload() async {
        loading = true
        feedback = nil
        do {
            sessions = try await sessionsRepository.listMine()
        } catch {
            feedback = (error as? ConvexException)?.message ?? error.localizedDescription
        }
        loading = false
    }

    private func revoke(_ sessionId: String) async {
        pending = true
        do {
            try await sessionsRepository.revoke(sessionId: sessionId)
            feedback = "Đã thu hồi phiên."
            await reload()
        } catch {
            feedback = (error as? ConvexException)?.message ?? error.localizedDescription
        }
        pending = false
    }

    private func revokeOthers() async {
        pending = true
        do {
            try await sessionsRepository.revokeAllOthers()
            feedback = "Đã đăng xuất tất cả phiên khác."
            await reload()
        } catch {
            feedback = (error as? ConvexException)?.message ?? error.localizedDescription
        }
        pending = false
    }
}
