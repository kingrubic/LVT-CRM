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
import lvt.crm.LvtApplication

class FcmTokenRegistrationWorker(
    appContext: Context,
    params: WorkerParameters,
) : CoroutineWorker(appContext, params) {
    override suspend fun doWork(): Result {
        val token = inputData.getString(INPUT_TOKEN).orEmpty()
        if (token.isBlank()) return Result.failure()
        val application = applicationContext as? LvtApplication ?: return Result.failure()
        return try {
            application.container.fcmTokenRegistrar.register(token)
            Result.success()
        } catch (_: Exception) {
            if (runAttemptCount < MAX_RETRIES) Result.retry() else Result.failure()
        }
    }

    companion object {
        private const val INPUT_TOKEN = "token"
        private const val UNIQUE_WORK = "lvt_fcm_token_registration"
        private const val MAX_RETRIES = 5

        fun enqueue(context: Context, token: String) {
            val request = OneTimeWorkRequestBuilder<FcmTokenRegistrationWorker>()
                .setConstraints(
                    Constraints.Builder()
                        .setRequiredNetworkType(NetworkType.CONNECTED)
                        .build(),
                )
                .setInputData(Data.Builder().putString(INPUT_TOKEN, token).build())
                .build()
            WorkManager.getInstance(context.applicationContext).enqueueUniqueWork(
                UNIQUE_WORK,
                ExistingWorkPolicy.REPLACE,
                request,
            )
        }
    }
}
