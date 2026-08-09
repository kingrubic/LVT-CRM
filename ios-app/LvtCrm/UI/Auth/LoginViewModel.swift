import Foundation

enum LoginMode {
    case signIn
    case forgotPassword
}

@MainActor
final class LoginViewModel: ObservableObject {
    @Published var email = ""
    @Published var password = ""
    @Published var mode: LoginMode = .signIn
    @Published var isBusy = false
    @Published var errorMessage: String?
    @Published var infoMessage: String?

    private let authRepository: AuthRepository

    init(authRepository: AuthRepository) {
        self.authRepository = authRepository
    }

    func submit() {
        Task { await performSubmit() }
    }

    func toggleMode() {
        mode = mode == .signIn ? .forgotPassword : .signIn
        errorMessage = nil
        infoMessage = nil
    }

    private func performSubmit() async {
        isBusy = true
        errorMessage = nil
        infoMessage = nil
        defer { isBusy = false }

        switch mode {
        case .signIn:
            let result = await authRepository.signIn(email: email, password: password)
            if case .failure(let error) = result {
                errorMessage = (error as? ConvexException)?.message
                    ?? ConvexHttpClient.humanize(error.localizedDescription)
            }
        case .forgotPassword:
            let result = await authRepository.requestPasswordReset(email: email)
            switch result {
            case .success:
                infoMessage = "Nếu email tồn tại, mật khẩu tạm sẽ được gửi. Kiểm tra hộp thư và đăng nhập lại."
                mode = .signIn
            case .failure(let error):
                errorMessage = (error as? ConvexException)?.message
                    ?? ConvexHttpClient.humanize(error.localizedDescription)
            }
        }
    }
}
