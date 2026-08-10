import SwiftUI

struct ProfileScreen: View {
    let session: UserSession
    let authRepository: AuthRepository
    let sessionsRepository: SessionsRepository
    var onSignOut: () -> Void

    @State private var showChangePassword = false
    @State private var showDevices = false

    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                GlassCard(tint: LvtColors.schoolIndigo) {
                    HStack(spacing: 14) {
                        ZStack {
                            Circle()
                                .fill(LvtColors.primaryContainer)
                                .frame(width: 64, height: 64)
                            Text(initial)
                                .font(.title.weight(.bold))
                                .foregroundStyle(LvtColors.schoolIndigoDark)
                        }
                        .glassEffect(.regular, in: .circle)

                        VStack(alignment: .leading, spacing: 4) {
                            Text(session.name)
                                .font(.title3.weight(.semibold))
                                .foregroundStyle(LvtColors.ink)
                            Text(session.email)
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                            StatusPill(text: session.roleLabel, tone: .accent)
                        }
                    }
                }

                GlassCard {
                    VStack(alignment: .leading, spacing: 12) {
                        InfoRow(label: "Vai trò", value: session.roleLabel)
                        InfoRow(label: "Tổ/phòng", value: session.departmentName ?? "—")
                        InfoRow(label: "Chức vụ", value: session.positionName ?? "—")
                    }
                }

                VStack(spacing: 10) {
                    Button("Thiết bị") { showDevices = true }
                        .buttonStyle(.glassProminent)
                        .tint(LvtColors.schoolIndigo)
                        .frame(maxWidth: .infinity)

                    Button("Đổi mật khẩu") { showChangePassword = true }
                        .buttonStyle(.glassProminent)
                        .tint(LvtColors.schoolIndigo)
                        .frame(maxWidth: .infinity)

                    Button("Đăng xuất", role: .destructive, action: onSignOut)
                        .buttonStyle(.glass)
                        .frame(maxWidth: .infinity)
                }
            }
            .padding(16)
        }
        .sheet(isPresented: $showChangePassword) {
            ChangePasswordScreen(
                title: "Đổi mật khẩu",
                subtitle: "Đặt mật khẩu mới cho tài khoản của bạn.",
                authRepository: authRepository,
                allowCancel: true,
                onDone: { showChangePassword = false },
                onCancel: { showChangePassword = false }
            )
            .presentationDetents([.medium, .large])
        }
        .sheet(isPresented: $showDevices) {
            DevicesScreen(sessionsRepository: sessionsRepository)
        }
    }

    private var initial: String {
        String(session.name.trimmingCharacters(in: .whitespacesAndNewlines).prefix(1)).uppercased()
    }
}
