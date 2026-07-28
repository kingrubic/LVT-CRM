# LVT CRM Android (internal APK)

Native Android app (Kotlin + Jetpack Compose) for school staff.

## V1 scope

- Login (email/password, same as web / Convex Auth) — wired
- Duties (Công tác) list + mark attendance — wired
- Work (Công việc) list + complete / admin quality % — wired
- Profile (change password + forced password gate) — wired
- Notifications — Convex feed, unread badge, mark read/all, dismiss (permission-based), item focus
- Native reminders — Android notification channel + WorkManager sync every 15 minutes
- Admin/Mod: same menus as normal users (no system admin / supreme settings)
- Deep links — `lvtcrm://notification?...` opens and highlights the matching duty/work item
- FCM — not enabled until a Firebase project/app config is provisioned; WorkManager is the working fallback

## Requirements

- Android Studio Ladybug+ (or newer)
- JDK 17 (bundled with Android Studio is fine)
- Android SDK with **minSdk 26** (Android 8.0)
- Device/emulator API 26+

## Open & build debug APK

```bash
cd android-app
# First time: open this folder in Android Studio → Trust project → Sync Gradle
# Then:
./gradlew :app:assembleDebug
```

APK output:

`app/build/outputs/apk/debug/app-debug.apk`

Install on a phone (allow unknown sources):

```bash
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

## Identifiers (temporary)

| | Value |
|---|---|
| App name | LVT CRM |
| applicationId | `lvt.crm` (debug: `lvt.crm.debug`) |

Before Play Store release, consider a more unique id (e.g. `vn.lvt.crm`) — changing `applicationId` later is a new app.

## Backend

Mirrors web:

- Convex: `https://lvt-convex.vscgroup.io.vn`
- Override in `local.properties`: `lvt.convex.url=http://10.0.2.2:3210` (emulator → host)

Auth tokens are stored in EncryptedSharedPreferences and refreshed via `auth:signIn` + refreshToken.

## Project layout

```
android-app/
  app/src/main/java/lvt/crm/
    MainActivity.kt
    AppContainer.kt
    data/auth/      # TokenStore + AuthRepository
    data/convex/    # HTTP client for query/mutation/action
    data/duties/
    data/notifications/
    data/work/
    ui/             # Compose screens
    push/           # notification channel, background sync, deep links
```

## Notifications

After sign-in, the app asks for notification permission on Android 13+ and
schedules a network-constrained background sync. Android only guarantees
periodic WorkManager runs at roughly 15-minute intervals; opening the app also
triggers an immediate sync.

Notification taps use the same `kind`, `sourceType`, `sourceId`, and
`notificationKey` contract as the web app. The app marks the item read, opens
the Công tác or Công việc tab, scrolls to the matching record, and highlights
it.

FCM remains an optional transport upgrade for near-instant delivery. Enabling
it requires a Firebase Android app for both `lvt.crm` and `lvt.crm.debug`, a
`google-services.json`, and server credentials stored outside git.
