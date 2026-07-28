# LVT CRM Android (internal APK)

Native Android app (Kotlin + Jetpack Compose) for school staff.

## V1 scope

- Login (email/password, same as web / Convex Auth) — wired
- Duties (Công tác) list + mark attendance — wired
- Work (Công việc) list + complete / admin quality % — wired
- Profile (change password + forced password gate) — wired
- Notifications — placeholder (FCM later)
- Admin/Mod: same menus as normal users (no system admin / supreme settings)
- Push (FCM): after notifications UI + deep links

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
    data/work/
    ui/             # Compose screens
    push/           # FCM (later)
```
