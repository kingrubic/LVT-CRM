package lvt.crm.push

import android.content.Context
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.Data
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import java.util.UUID
import lvt.crm.LvtApplication

class NotificationMarkReadWorker(
    appContext: Context,
    params: WorkerParameters,
) : CoroutineWorker(appContext, params) {
    override suspend fun doWork(): Result {
        val key = inputData.getString(INPUT_KEY).orEmpty()
        if (key.isBlank()) return Result.failure()
        val application = applicationContext as? LvtApplication ?: return Result.failure()
        return try {
            application.container.notificationsRepository.markRead(key)
            Result.success()
        } catch (_: Exception) {
            if (runAttemptCount < MAX_RETRIES) Result.retry() else Result.failure()
        }
    }

    companion object {
        private const val INPUT_KEY = "notification_key"
        private const val MAX_RETRIES = 5

        fun enqueue(context: Context, key: String) {
            val stableId = UUID.nameUUIDFromBytes(key.toByteArray()).toString()
            val request = OneTimeWorkRequestBuilder<NotificationMarkReadWorker>()
                .setConstraints(
                    Constraints.Builder()
                        .setRequiredNetworkType(NetworkType.CONNECTED)
                        .build(),
                )
                .setInputData(Data.Builder().putString(INPUT_KEY, key).build())
                .build()
            WorkManager.getInstance(context.applicationContext).enqueueUniqueWork(
                "lvt_notification_mark_read_$stableId",
                ExistingWorkPolicy.KEEP,
                request,
            )
        }
    }
}
