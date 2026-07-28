package lvt.crm.push

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import lvt.crm.LvtApplication

class NotificationSyncWorker(
    appContext: Context,
    params: WorkerParameters,
) : CoroutineWorker(appContext, params) {
    override suspend fun doWork(): Result {
        val application = applicationContext as? LvtApplication ?: return Result.failure()
        if (application.container.tokenStore.accessToken.isNullOrBlank()) {
            return Result.success()
        }
        return try {
            val snapshot = application.container.notificationsRepository.feed()
            val unread = snapshot.items.filter { !it.read }
            val unreadKeys = unread.mapTo(mutableSetOf()) { it.key }
            val preferences = applicationContext.getSharedPreferences(
                PREFERENCES,
                Context.MODE_PRIVATE,
            )
            val delivered = preferences.getStringSet(DELIVERED_KEYS, emptySet())
                ?.toMutableSet()
                ?: mutableSetOf()
            delivered.retainAll(unreadKeys)

            unread
                .asSequence()
                .filter { it.key !in delivered }
                .take(MAX_PER_SYNC)
                .forEach { item ->
                    if (NotificationCenter.show(applicationContext, item)) {
                        delivered += item.key
                    }
                }
            preferences.edit().putStringSet(DELIVERED_KEYS, delivered).apply()
            Result.success()
        } catch (_: Exception) {
            if (runAttemptCount < MAX_RETRIES) Result.retry() else Result.failure()
        }
    }

    companion object {
        private const val PREFERENCES = "lvt_notification_delivery"
        private const val DELIVERED_KEYS = "delivered_keys"
        private const val MAX_PER_SYNC = 5
        private const val MAX_RETRIES = 3

        fun clearDeliveryHistory(context: Context) {
            context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
                .edit()
                .clear()
                .apply()
        }
    }
}
