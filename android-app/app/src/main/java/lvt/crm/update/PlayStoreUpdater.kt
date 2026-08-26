package lvt.crm.update

import android.util.Log
import androidx.activity.ComponentActivity
import androidx.activity.result.ActivityResultLauncher
import androidx.activity.result.IntentSenderRequest
import com.google.android.play.core.appupdate.AppUpdateManager
import com.google.android.play.core.appupdate.AppUpdateManagerFactory
import com.google.android.play.core.appupdate.AppUpdateOptions
import com.google.android.play.core.install.model.AppUpdateType
import com.google.android.play.core.install.model.UpdateAvailability

class PlayStoreUpdater(
    activity: ComponentActivity,
    private val launcher: ActivityResultLauncher<IntentSenderRequest>,
    private val manager: AppUpdateManager = AppUpdateManagerFactory.create(activity),
) {
    fun checkOnResume() {
        manager.appUpdateInfo
            .addOnSuccessListener { info ->
                val start = PlayStoreUpdatePolicy.shouldStartImmediateUpdate(
                    updateAvailable = info.updateAvailability() == UpdateAvailability.UPDATE_AVAILABLE,
                    immediateAllowed = info.isUpdateTypeAllowed(AppUpdateType.IMMEDIATE),
                    developerTriggeredInProgress =
                        info.updateAvailability() == UpdateAvailability.DEVELOPER_TRIGGERED_UPDATE_IN_PROGRESS,
                )
                if (!start) return@addOnSuccessListener
                runCatching {
                    manager.startUpdateFlowForResult(
                        info,
                        launcher,
                        AppUpdateOptions.newBuilder(AppUpdateType.IMMEDIATE).build(),
                    )
                }.onFailure { error ->
                    Log.w(TAG, "Could not start Play in-app update", error)
                }
            }
            .addOnFailureListener { error ->
                Log.w(TAG, "Play in-app update check failed", error)
            }
    }

    companion object {
        private const val TAG = "LvtPlayUpdate"
    }
}
