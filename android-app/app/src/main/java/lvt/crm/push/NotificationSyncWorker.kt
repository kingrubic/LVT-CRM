package lvt.crm.push

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import lvt.crm.LvtApplication
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

class NotificationSyncWorker(
    appContext: Context,
    params: WorkerParameters,
) : CoroutineWorker(appContext, params) {
    override suspend fun doWork(): Result = syncMutex.withLock {
        val application = applicationContext as? LvtApplication ?: return@withLock Result.failure()
        val credentialStore = application.container.tokenStore
        val session = credentialStore.snapshot() ?: return@withLock Result.success()
        return try {
            val snapshot = application.container.notificationsRepository.feed()
            val unread = snapshot.items.filter { !it.read }
            val unreadKeys = unread.mapTo(mutableSetOf()) { it.key }
            val preferences = applicationContext.getSharedPreferences(
                PREFERENCES,
                Context.MODE_PRIVATE,
            )
            val storedDelivered = preferences.getStringSet(DELIVERED_KEYS, emptySet())
                ?.toMutableSet()
                ?: mutableSetOf()
            val delivered = storedDelivered.toMutableSet()
            delivered.retainAll(unreadKeys)
            if (delivered != storedDelivered) {
                val persisted = NotificationSessionBoundary.runIfCurrent(
                    expected = session,
                    current = credentialStore::snapshot,
                ) {
                    preferences.edit().putStringSet(DELIVERED_KEYS, delivered).commit()
                }
                if (persisted == null) return@withLock Result.success()
                check(persisted) { "NOTIFICATION_HISTORY_WRITE_FAILED" }
            }

            unread
                .asSequence()
                .filter { it.key !in delivered }
                .take(MAX_PER_SYNC)
                .forEach { item ->
                    val deliveredForSession = NotificationSessionBoundary.runIfCurrent(
                        expected = session,
                        current = credentialStore::snapshot,
                    ) {
                        if (!NotificationCenter.show(applicationContext, item)) {
                            return@runIfCurrent false
                        }
                        // Logout may happen after posting. The shared boundary guarantees its
                        // cleanup runs next; do not recreate delivery history for that session.
                        if (credentialStore.snapshot() != session) {
                            return@runIfCurrent false
                        }
                        val updated = delivered + item.key
                        check(
                            preferences.edit().putStringSet(DELIVERED_KEYS, updated).commit(),
                        ) { "NOTIFICATION_HISTORY_WRITE_FAILED" }
                        delivered += item.key
                        true
                    }
                    if (deliveredForSession == null || credentialStore.snapshot() != session) {
                        return@withLock Result.success()
                    }
                }
            Result.success()
        } catch (e: CancellationException) {
            throw e
        } catch (_: Exception) {
            if (runAttemptCount < MAX_RETRIES) Result.retry() else Result.failure()
        }
    }

    companion object {
        private const val PREFERENCES = "lvt_notification_delivery"
        private const val DELIVERED_KEYS = "delivered_keys"
        private const val MAX_PER_SYNC = 5
        private const val MAX_RETRIES = 3
        private val syncMutex = Mutex()

        fun clearDeliveryHistory(context: Context) {
            context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
                .edit()
                .clear()
                .commit()
        }
    }
}
