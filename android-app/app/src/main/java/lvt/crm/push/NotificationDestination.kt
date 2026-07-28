package lvt.crm.push

import android.content.Intent
import android.net.Uri

data class NotificationDestination(
    val kind: String,
    val sourceType: String,
    val sourceId: String,
    val notificationKey: String?,
) {
    val route: String
        get() = routeForKind(kind)

    companion object {
        const val EXTRA_KIND = "lvt.notification.kind"
        const val EXTRA_SOURCE_TYPE = "lvt.notification.source_type"
        const val EXTRA_SOURCE_ID = "lvt.notification.source_id"
        const val EXTRA_NOTIFICATION_KEY = "lvt.notification.key"

        fun fromIntent(intent: Intent?): NotificationDestination? {
            val data = intent?.data?.takeIf {
                it.scheme == DEEP_LINK_SCHEME && it.host == DEEP_LINK_HOST
            }
            val sourceId = (
                intent?.getStringExtra(EXTRA_SOURCE_ID)
                    ?: data?.getQueryParameter(QUERY_SOURCE_ID)
                )?.takeIf { it.isNotBlank() } ?: return null
            return NotificationDestination(
                kind = intent?.getStringExtra(EXTRA_KIND)
                    ?: data?.getQueryParameter(QUERY_KIND).orEmpty(),
                sourceType = intent?.getStringExtra(EXTRA_SOURCE_TYPE)
                    ?: data?.getQueryParameter(QUERY_SOURCE_TYPE).orEmpty(),
                sourceId = sourceId,
                notificationKey = intent?.getStringExtra(EXTRA_NOTIFICATION_KEY)
                    ?: data?.getQueryParameter(QUERY_NOTIFICATION_KEY),
            )
        }

        fun toUri(destination: NotificationDestination): Uri =
            Uri.Builder()
                .scheme(DEEP_LINK_SCHEME)
                .authority(DEEP_LINK_HOST)
                .appendQueryParameter(QUERY_KIND, destination.kind)
                .appendQueryParameter(QUERY_SOURCE_TYPE, destination.sourceType)
                .appendQueryParameter(QUERY_SOURCE_ID, destination.sourceId)
                .apply {
                    destination.notificationKey?.let {
                        appendQueryParameter(QUERY_NOTIFICATION_KEY, it)
                    }
                }
                .build()

        fun routeForKind(kind: String): String =
            if (kind == "duty") "duties" else "work"

        private const val DEEP_LINK_SCHEME = "lvtcrm"
        private const val DEEP_LINK_HOST = "notification"
        private const val QUERY_KIND = "kind"
        private const val QUERY_SOURCE_TYPE = "sourceType"
        private const val QUERY_SOURCE_ID = "sourceId"
        private const val QUERY_NOTIFICATION_KEY = "key"
    }
}
