# LVT CRM Android (internal APK)

Native Android app (Kotlin + Jetpack Compose) for school staff.

## V1 scope

- Login (email/password, same as web / Convex Auth)
- Notifications
- Duties (Công tác)
- Work (Công việc)
- Profile (change password)
- Admin/Mod: same menus as normal users (no system admin / supreme settings)
- Push (FCM): after duties/work UI + deep links are done

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
| applicationId | `lvt.crm` |

Before Play Store release, consider a more unique id (e.g. `vn.lvt.crm`) — changing `applicationId` later is a new app.

## Backend

Mirrors web:

- Convex: `https://lvt-convex.vscgroup.io.vn` (override in `local.properties` if needed)

## Project layout

```
android-app/
  app/src/main/java/lvt/crm/
    MainActivity.kt
    LvtApp.kt
    ui/          # Compose screens
    data/        # auth + API clients
    push/        # FCM (later)
```
