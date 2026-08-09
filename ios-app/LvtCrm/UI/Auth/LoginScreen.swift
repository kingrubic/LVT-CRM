import SwiftUI

struct LoginScreen: View {
    @StateObject private var viewModel: LoginViewModel
    @State private var passwordVisible = false
    @FocusState private var focusedField: Field?

    private enum Field { case email, password }

    init(authRepository: AuthRepository) {
        _viewModel = StateObject(wrappedValue: LoginViewModel(authRepository: authRepository))
    }

    var body: some View {
        ZStack {
            AmbientBackground()
            ScrollView {
                VStack(spacing: 20) {
                    SchoolLogo(size: 104)
                    VStack(spacing: 6) {
                        Text("THCS Lê Văn Tám")
                            .font(.system(.largeTitle, design: .rounded).weight(.bold))
                            .foregroundStyle(LvtColors.schoolIndigo)
                            .multilineTextAlignment(.center)
                        Text("Hệ thống quản lý công tác nội bộ")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                            .multilineTextAlignment(.center)
                    }

                    GlassCard {
                        VStack(alignment: .leading, spacing: 14) {
                            Text(viewModel.mode == .signIn ? "Đăng nhập" : "Quên mật khẩu")
                                .font(.title3.weight(.semibold))
                                .foregroundStyle(LvtColors.ink)

                            TextField("Email", text: $viewModel.email)
                                .textContentType(.username)
                                .keyboardType(.emailAddress)
                                .textInputAutocapitalization(.never)
                                .autocorrectionDisabled()
                                .focused($focusedField, equals: .email)
                                .padding(12)
                                .glassEffect(.regular, in: .rect(cornerRadius: 14))

                            if viewModel.mode == .signIn {
                                HStack {
                                    Group {
                                        if passwordVisible {
                                            TextField("Mật khẩu", text: $viewModel.password)
                                        } else {
                                            SecureField("Mật khẩu", text: $viewModel.password)
                                        }
                                    }
                                    .textContentType(.password)
                                    .focused($focusedField, equals: .password)

                                    Button {
                                        passwordVisible.toggle()
                                    } label: {
                                        Image(systemName: passwordVisible ? "eye.slash" : "eye")
                                    }
                                    .buttonStyle(.plain)
                                    .foregroundStyle(.secondary)
                                }
                                .padding(12)
                                .glassEffect(.regular, in: .rect(cornerRadius: 14))
                            }

                            if let error = viewModel.errorMessage {
                                Text(error)
                                    .font(.footnote)
                                    .foregroundStyle(LvtColors.torchRed)
                            }
                            if let info = viewModel.infoMessage {
                                Text(info)
                                    .font(.footnote)
                                    .foregroundStyle(LvtColors.teal)
                            }

                            Button {
                                focusedField = nil
                                viewModel.submit()
                            } label: {
                                HStack {
                                    if viewModel.isBusy {
                                        ProgressView()
                                            .tint(.white)
                                    }
                                    Text(viewModel.mode == .signIn ? "Đăng nhập" : "Gửi mật khẩu tạm")
                                        .fontWeight(.semibold)
                                }
                                .frame(maxWidth: .infinity)
                            }
                            .buttonStyle(.glassProminent)
                            .tint(LvtColors.schoolIndigo)
                            .disabled(viewModel.isBusy)

                            Button(viewModel.mode == .signIn ? "Quên mật khẩu?" : "Quay lại đăng nhập") {
                                viewModel.toggleMode()
                            }
                            .buttonStyle(.glass)
                            .frame(maxWidth: .infinity)
                        }
                    }
                }
                .padding(24)
                .frame(maxWidth: 480)
                .frame(maxWidth: .infinity)
            }
        }
    }
}
