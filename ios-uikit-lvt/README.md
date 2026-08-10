# LVT CRM UIKit Scaffold

Parallel UIKit rewrite workspace for LVT CRM. The current scope includes UIKit authentication/profile, Notifications, Duties, Work, and push notification delivery/lifecycle behavior.

## Open and build

```bash
open LvtCrmUIKit.xcodeproj
```

The shared `LvtCrmUIKit` scheme builds an iPhone app with:

- bundle identifier `vn.lvt.crm.uikit`
- iOS 26.0 deployment target
- UIKit `UIApplicationDelegate` / `UISceneDelegate` lifecycle
- auth restoration, login, password reset request, forced/optional password change, and sign-out using the existing Convex contracts
- a native `UITabBarController` shown only after the backend confirms authentication
- UIKit Notifications with the real Convex feed/read/read-all/dismiss contracts
- UIKit Duties with the real Convex list/attendance contracts, native filtering, and notification focus routing
- UIKit Work with the real Convex contracts and notification focus routing
- notification authorization, APNs token registration/sync, foreground presentation, background refresh, and cold/warm notification routing

The simulator build validates compilation and configuration only. APNs token issuance and remote delivery require a correctly provisioned physical device and backend push credentials.

CLI validation:

```bash
xcodebuild -project LvtCrmUIKit.xcodeproj -scheme LvtCrmUIKit \
  -destination 'generic/platform=iOS Simulator' \
  -configuration Debug \
  -derivedDataPath .derivedData \
  build CODE_SIGNING_ALLOWED=NO
```

No source, configuration, credentials, or secrets are copied from the existing `ios-app` workspace.
