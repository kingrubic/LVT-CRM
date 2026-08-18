package lvt.crm.push

import android.content.Context
import androidx.core.app.NotificationManagerCompat
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import java.util.concurrent.TimeUnit

class NotificationScheduler(context: Context) {
    private val appContext = context.applicationContext
    private val workManager = WorkManager.getInstance(appContext)
    private val constraints = Constraints.Builder()
        .setRequiredNetworkType(NetworkType.CONNECTED)
        .build()

    fun schedule() {
        val periodic = PeriodicWorkRequestBuilder<NotificationSyncWorker>(
            15,
            TimeUnit.MINUTES,
        )
            .setConstraints(constraints)
            .build()
        workManager.enqueueUniquePeriodicWork(
            PERIODIC_WORK,
            ExistingPeriodicWorkPolicy.KEEP,
            periodic,
        )
        syncNow()
    }

    fun syncNow() {
        val immediate = OneTimeWorkRequestBuilder<NotificationSyncWorker>()
            .setConstraints(constraints)
            .build()
        // REPLACE: an FCM wake-up must not be dropped while a stale immediate
        // sync (started before the new feed item existed) is still pending.
        workManager.enqueueUniqueWork(
            IMMEDIATE_WORK,
            ExistingWorkPolicy.REPLACE,
            immediate,
        )
    }

    fun cancel() {
        workManager.cancelUniqueWork(PERIODIC_WORK)
        workManager.cancelUniqueWork(IMMEDIATE_WORK)
        NotificationSessionBoundary.cleanup {
            NotificationManagerCompat.from(appContext).cancelAll()
            NotificationSyncWorker.clearDeliveryHistory(appContext)
        }
    }

    companion object {
        private const val PERIODIC_WORK = "lvt_notification_periodic_sync"
        private const val IMMEDIATE_WORK = "lvt_notification_immediate_sync"
    }
}
