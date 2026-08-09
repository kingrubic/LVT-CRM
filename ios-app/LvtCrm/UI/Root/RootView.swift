import SwiftUI

struct RootView: View {
    @ObservedObject var container: AppContainer
    @Binding var pendingDestination: NotificationDestination?
    @ObservedObject private var authRepository: AuthRepository

    init(container: AppContainer, pendingDestination: Binding<NotificationDestination?>) {
        self.container = container
        self._pendingDestination = pendingDestination
        self._authRepository = ObservedObject(wrappedValue: container.authRepository)
    }

    var body: some View {
        Group {
            switch authRepository.state {
            case .loading:
                LoadingPlaceholder()
            case .signedOut:
                LoginScreen(authRepository: authRepository)
            case .mustChangePassword:
                ChangePasswordScreen(
                    title: "Đổi mật khẩu bắt buộc",
                    subtitle: "Bạn cần đặt mật khẩu mới trước khi dùng ứng dụng.",
                    authRepository: authRepository,
                    allowCancel: false,
                    onDone: {}
                )
            case .signedIn(let session):
                MainShell(
                    container: container,
                    session: session,
                    pendingDestination: $pendingDestination,
                    onSignOut: {
                        authRepository.signOut()
                        container.notificationSync.cancel()
                    }
                )
            }
        }
        .animation(.smooth, value: authRepository.state)
    }
}

struct MainShell: View {
    @ObservedObject var container: AppContainer
    let session: UserSession
    @Binding var pendingDestination: NotificationDestination?
    var onSignOut: () -> Void

    @StateObject private var notificationsViewModel: NotificationsViewModel
    @StateObject private var dutiesViewModel: DutiesViewModel
    @StateObject private var workViewModel: WorkViewModel

    @State private var selectedTab: AppTab = .notifications
    @State private var focusTarget: NotificationDestination?
    @State private var tabOpenToken = 0

    init(
        container: AppContainer,
        session: UserSession,
        pendingDestination: Binding<NotificationDestination?>,
        onSignOut: @escaping () -> Void
    ) {
        self.container = container
        self.session = session
        self._pendingDestination = pendingDestination
        self.onSignOut = onSignOut
        _notificationsViewModel = StateObject(
            wrappedValue: NotificationsViewModel(repository: container.notificationsRepository)
        )
        _dutiesViewModel = StateObject(
            wrappedValue: DutiesViewModel(repository: container.dutiesRepository)
        )
        _workViewModel = StateObject(
            wrappedValue: WorkViewModel(repository: container.workRepository)
        )
    }

    var body: some View {
        ZStack {
            AmbientBackground()
            VStack(spacing: 0) {
                appBar
                Group {
                    switch selectedTab {
                    case .notifications:
                        NotificationsScreen(
                            viewModel: notificationsViewModel,
                            onOpenItem: openNotification,
                            tabOpenToken: tabOpenToken
                        )
                    case .duties:
                        DutiesScreen(
                            viewModel: dutiesViewModel,
                            focusId: focusTarget?.route == .duties ? focusTarget?.sourceId : nil,
                            tabOpenToken: tabOpenToken
                        )
                    case .work:
                        WorkScreen(
                            viewModel: workViewModel,
                            focusId: focusTarget?.route == .work ? focusTarget?.sourceId : nil,
                            tabOpenToken: tabOpenToken
                        )
                    case .profile:
                        ProfileScreen(
                            session: session,
                            authRepository: container.authRepository,
                            onSignOut: onSignOut
                        )
                    }
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .safeAreaInset(edge: .bottom) {
            glassTabBar
        }
        .task {
            await NotificationCenterService.requestAuthorizationIfNeeded()
            container.notificationSync.schedule()
            await container.notificationSync.syncNow()
            container.apnsRegistrar.registerForRemoteNotifications()
            await container.apnsRegistrar.sync()
        }
        .onChange(of: pendingDestination) { _, destination in
            guard let destination else { return }
            focusTarget = destination
            selectedTab = destination.route
            if let key = destination.notificationKey {
                Task {
                    do {
                        try await container.notificationsRepository.markRead(notificationKey: key)
                    } catch {
                        // Best-effort; next sync will still show unread if needed.
                    }
                    notificationsViewModel.refresh()
                }
            }
            pendingDestination = nil
        }
    }

    private var appBar: some View {
        HStack(spacing: 12) {
            SchoolLogo(size: 42)
            VStack(alignment: .leading, spacing: 2) {
                Text("THCS Lê Văn Tám")
                    .font(.headline)
                    .foregroundStyle(LvtColors.schoolIndigo)
                Text("CRM nội bộ")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            Text(String(session.name.prefix(1)).uppercased())
                .font(.headline.weight(.bold))
                .foregroundStyle(LvtColors.schoolIndigoDark)
                .frame(width: 40, height: 40)
                .glassEffect(.regular.tint(LvtColors.primaryContainer), in: .circle)
        }
        .padding(.horizontal, 18)
        .padding(.vertical, 12)
        .glassEffect(.regular, in: .rect(cornerRadius: 0))
    }

    private var glassTabBar: some View {
        GlassEffectContainer {
            HStack(spacing: 8) {
                ForEach(AppTab.allCases) { tab in
                    Button {
                        tabOpenToken += 1
                        focusTarget = nil
                        selectedTab = tab
                    } label: {
                        VStack(spacing: 4) {
                            ZStack(alignment: .topTrailing) {
                                Image(systemName: tab.systemImage)
                                    .font(.system(size: 18, weight: .semibold))
                                if tab == .notifications, notificationsViewModel.unreadCount > 0 {
                                    Text(badgeText)
                                        .font(.caption2.weight(.bold))
                                        .padding(.horizontal, 5)
                                        .padding(.vertical, 1)
                                        .background(LvtColors.torchRed, in: Capsule())
                                        .foregroundStyle(.white)
                                        .offset(x: 10, y: -8)
                                }
                            }
                            Text(tab.title)
                                .font(.caption2.weight(.semibold))
                        }
                        .foregroundStyle(selectedTab == tab ? LvtColors.schoolIndigo : .secondary)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 10)
                        .glassEffect(
                            selectedTab == tab
                                ? .regular.interactive().tint(LvtColors.schoolIndigo.opacity(0.2))
                                : .regular,
                            in: .rect(cornerRadius: 18)
                        )
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
        }
        .padding(.horizontal, 10)
        .padding(.bottom, 6)
    }

    private var badgeText: String {
        notificationsViewModel.unreadCount > 99 ? "99+" : "\(notificationsViewModel.unreadCount)"
    }

    private func openNotification(_ item: NotificationItem) {
        let destination = NotificationDestination(
            kind: item.kind,
            sourceType: item.sourceType,
            sourceId: item.sourceId,
            notificationKey: item.key
        )
        focusTarget = destination
        selectedTab = destination.route
    }
}
