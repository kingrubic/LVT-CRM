# LVT CRM UIKit Scaffold

Parallel UIKit rewrite workspace for LVT CRM. The current scope includes UIKit authentication/profile, Notifications, Duties, Work, and push notification delivery/lifecycle behavior.

## Open and build

```bash
open LvtCrmUIKit.xcodeproj
```

The shared `LvtCrmUIKit` scheme builds an iPhone app with:

- bundle identifier `vn.lvt.crm.uikit`
- display name `CRM Lê Văn Tám`
- iOS 17.0 deployment target (Liquid Glass tab bar still appears on iOS 26 devices)
- UIKit `UIApplicationDelegate` / `UISceneDelegate` lifecycle
- auth restoration, login, password reset request, forced/optional password change, and sign-out using the existing Convex contracts
- a native `UITabBarController` shown only after the backend confirms authentication
- UIKit Notifications with the real Convex feed/read/read-all/dismiss contracts
- UIKit Duties with the real Convex list/attendance contracts, native filtering, and notification focus routing
- UIKit Work with the real Convex contracts and notification focus routing
- notification authorization, APNs token registration/sync, foreground presentation, background refresh, and cold/warm notification routing

The simulator build validates compilation and configuration only. APNs token issuance and remote lock-screen delivery require a physical device, the Push Notification entitlement, and Convex env `APNS_KEY_P8`, `APNS_KEY_ID`, `APNS_TEAM_ID` (optional `APNS_BUNDLE_ID`). Set `APNS_PRODUCTION=true` when testers install TestFlight or App Store builds.

## App Store / TestFlight

1. App Store Connect: New App, bundle `vn.lvt.crm.uikit`, name **CRM Lê Văn Tám**.
2. Xcode: Team `42ZDDJ2B8M`, scheme **Release** (uses production push entitlements) → Product → Archive → Distribute App → App Store Connect.
3. Privacy: `https://lvt.vscgroup.io.vn/privacy` · Account deletion: `https://lvt.vscgroup.io.vn/xoa-tai-khoan`.
4. Icon: `LvtCrmUIKit/Assets.xcassets/AppIcon.appiconset/AppIcon-1024.png`.
5. Privacy manifest: `LvtCrmUIKit/PrivacyInfo.xcprivacy` (UserDefaults + file timestamps; no tracking).
6. Version `0.3.1` (build 6). Do **not** set Convex `APNS_PRODUCTION=true` until testers install this TestFlight/App Store build.

CLI validation:

```bash
xcodebuild -project LvtCrmUIKit.xcodeproj -scheme LvtCrmUIKit \
  -destination 'generic/platform=iOS Simulator' \
  -configuration Debug \
  -derivedDataPath .derivedData \
  build CODE_SIGNING_ALLOWED=NO
```

No source, configuration, credentials, or secrets are copied from the existing `ios-app` workspace.
