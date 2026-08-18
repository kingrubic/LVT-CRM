package lvt.crm.ui.profile

import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import lvt.crm.BuildConfig

fun currentAppVersion(context: Context? = null): String {
    val raw = context?.let(::packageVersionName) ?: BuildConfig.VERSION_NAME
    return raw.substringBefore("-").ifBlank { "0.0.0" }
}

private fun packageVersionName(context: Context): String? {
    val info = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        context.packageManager.getPackageInfo(
            context.packageName,
            PackageManager.PackageInfoFlags.of(0),
        )
    } else {
        @Suppress("DEPRECATION")
        context.packageManager.getPackageInfo(context.packageName, 0)
    }
    return info.versionName
}
