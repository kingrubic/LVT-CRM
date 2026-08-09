# LVT CRM iOS

Native SwiftUI app (iOS 26+) for school staff — same Convex backend and feature set as `android-app`.

## V1 scope

- Liquid Glass UI (`.glassEffect`, `GlassEffectContainer`, glass buttons) with THCS Lê Văn Tám branding
- Login (email/password) + forgot password + forced password change
- Duties (Công tác) list/detail + mark attendance
- Work (Công việc) tasks, approvals (level ≥ 4), admin documents + completion review
- Profile (change password + sign out)
- Notifications feed, unread badge, mark read/all, dismiss (permission-based)
- Local reminder sync via `BGAppRefreshTask` (~15 min) + immediate sync on launch
- Deep links — `lvtcrm://notification?kind=&sourceType=&sourceId=&key=`
- APNs token registration via `push:registerToken` (optional until Apple Push is provisioned)

## Requirements

- Xcode 26+ (Liquid Glass APIs)
- iOS 26.0+ device or simulator
- Apple Developer team for device installs / APNs

## Open & run

```bash
cd ios-app
open LvtCrm.xcodeproj
```

In Xcode: select a simulator or device → Run.

CLI build (simulator):

```bash
xcodebuild -project LvtCrm.xcodeproj -scheme LvtCrm \
  -destination 'generic/platform=iOS Simulator' \
  -configuration Debug \
  -derivedDataPath .derivedData \
  build CODE_SIGNING_ALLOWED=NO
```

## Identifiers

| | Value |
|---|---|
| App name | LVT CRM |
| Bundle ID | `vn.lvt.crm` |
| Deep link | `lvtcrm://notification` |

## Backend

Mirrors web / Android:

- Convex: `https://lvt-convex.vscgroup.io.vn`
- Override in `Info.plist` key `LVTConvexURL`, or debug env `LVT_CONVEX_URL`

Auth tokens are stored in the Keychain and refreshed via `auth:signIn` + refreshToken.

## Project layout

```
ios-app/
  LvtCrm/
    LvtCrmApp.swift          # App entry + APNs / deep links
    AppContainer.swift       # Manual DI
    Data/                    # Convex client, auth, duties, work, notifications
    Push/                    # Local sync, APNs registrar, destinations
    UI/                      # Liquid Glass SwiftUI screens
  LvtCrm.xcodeproj/
```

## Notifications

After sign-in the app requests notification permission, schedules background refresh, and syncs the Convex feed. Unread items not yet delivered become local notifications (max 5 per sync). Taps mark the item read and open Công tác or Công việc with focus highlight.
