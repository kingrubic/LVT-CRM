import SwiftUI

struct ChangePasswordScreen: View {
    let title: String
    let subtitle: String
    let authRepository: AuthRepository
    var allowCancel: Bool = true
    var onDone: () -> Void
    var onCancel: (() -> Void)? = nil

    @State private var password = ""
    @State private var confirm = ""
    @State private var isBusy = false
    @State private var errorMessage: String?

    var body: some View {
        ZStack {
            AmbientBackground()
            VStack(spacing: 18) {
                SchoolLogo(size: 72)
                Text(title)
                    .font(.title2.weight(.bold))
                    .foregroundStyle(LvtColors.schoolIndigo)
                Text(subtitle)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)

                GlassCard {
                    VStack(spacing: 12) {
                        SecureField("Mật khẩu mới (≥ 8 ký tự)", text: $password)
                            .padding(12)
                            .glassEffect(.regular, in: .rect(cornerRadius: 14))
                        SecureField("Nhập lại mật khẩu", text: $confirm)
                            .padding(12)
                            .glassEffect(.regular, in: .rect(cornerRadius: 14))

                        if let errorMessage {
                            Text(errorMessage)
                                .font(.footnote)
                                .foregroundStyle(LvtColors.torchRed)
                        }

                        Button {
                            Task { await submit() }
                        } label: {
                            HStack {
                                if isBusy { ProgressView().tint(.white) }
                                Text("Lưu mật khẩu").fontWeight(.semibold)
                            }
                            .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.glassProminent)
                        .tint(LvtColors.schoolIndigo)
                        .disabled(isBusy)

                        if allowCancel {
                            Button("Huỷ") { onCancel?() }
                                .buttonStyle(.glass)
                                .frame(maxWidth: .infinity)
                        }
                    }
                }
            }
            .padding(24)
        }
    }

    private func submit() async {
        errorMessage = nil
        guard password.count >= 8 else {
            errorMessage = ConvexHttpClient.humanize("PASSWORD_TOO_SHORT")
            return
        }
        guard password == confirm else {
            errorMessage = "Mật khẩu nhập lại không khớp."
            return
        }
        isBusy = true
        defer { isBusy = false }
        let result = await authRepository.changePassword(newPassword: password)
        switch result {
        case .success:
            onDone()
        case .failure(let error):
            errorMessage = (error as? ConvexException)?.message
                ?? ConvexHttpClient.humanize(error.localizedDescription)
        }
    }
}
