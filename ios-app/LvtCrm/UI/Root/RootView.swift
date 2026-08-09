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
    @Namespace private var tabNamespace

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
        ZStack(alignment: .bottom) {
            AmbientBackground()

            VStack(spacing: 0) {
                appBar
                tabContent
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    // Keep last rows readable while content still scrolls under the floating bar.
                    .contentMargins(.bottom, 96, for: .scrollContent)
            }

            // Overlay (not safeAreaInset) so list content passes behind the glass — required for
            // the frosted Liquid Glass look like GitHub.
            floatingTabBar
                .padding(.horizontal, 20)
                .padding(.bottom, 10)
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
            withAnimation(.spring(response: 0.35, dampingFraction: 0.86)) {
                selectedTab = destination.route
            }
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

    @ViewBuilder
    private var tabContent: some View {
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

    private var appBar: some View {
        HStack(spacing: 12) {
            Image("LogoLvt")
                .resizable()
                .scaledToFit()
                .frame(width: 40, height: 40)
                .clipShape(Circle())
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
                .font(.subheadline.weight(.bold))
                .foregroundStyle(LvtColors.schoolIndigoDark)
                .frame(width: 36, height: 36)
                .background(.thinMaterial, in: Circle())
        }
        .padding(.horizontal, 18)
        .padding(.vertical, 10)
        .background(.ultraThinMaterial)
    }

    /// Single floating capsule — one glass sample, GitHub-style. Per-tab glass was the lag source.
    private var floatingTabBar: some View {
        HStack(spacing: 0) {
            ForEach(AppTab.allCases) { tab in
                Button {
                    tabOpenToken += 1
                    focusTarget = nil
                    withAnimation(.spring(response: 0.35, dampingFraction: 0.86)) {
                        selectedTab = tab
                    }
                } label: {
                    VStack(spacing: 3) {
                        ZStack(alignment: .topTrailing) {
                            Image(systemName: tab.systemImage)
                                .font(.system(size: 20, weight: selectedTab == tab ? .semibold : .regular))
                                .symbolEffect(.bounce, value: selectedTab == tab ? tabOpenToken : 0)
                            if tab == .notifications, notificationsViewModel.unreadCount > 0 {
                                Text(badgeText)
                                    .font(.system(size: 9, weight: .bold))
                                    .padding(.horizontal, 4)
                                    .padding(.vertical, 1)
                                    .background(LvtColors.torchRed, in: Capsule())
                                    .foregroundStyle(.white)
                                    .offset(x: 8, y: -6)
                            }
                        }
                        Text(tab.title)
                            .font(.system(size: 10, weight: .medium))
                            .lineLimit(1)
                            .minimumScaleFactor(0.8)
                    }
                    .foregroundStyle(selectedTab == tab ? LvtColors.schoolIndigo : .secondary)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 8)
                    .background {
                        if selectedTab == tab {
                            Capsule()
                                .fill(LvtColors.schoolIndigo.opacity(0.14))
                                .matchedGeometryEffect(id: "selectedTab", in: tabNamespace)
                        }
                    }
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .glassEffect(.regular, in: .capsule)
        .shadow(color: .black.opacity(0.12), radius: 20, y: 8)
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
