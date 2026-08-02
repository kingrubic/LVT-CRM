package lvt.crm.push

import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import lvt.crm.LvtApplication

class LvtFirebaseMessagingService : FirebaseMessagingService() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun onNewToken(token: String) {
        (application as? LvtApplication)?.container?.let { container ->
            scope.launch { container.fcmTokenRegistrar.register(token) }
        }
    }

    override fun onMessageReceived(message: RemoteMessage) {
        val application = application as? LvtApplication ?: return
        PushEvents.notifyReceived()
        application.container.notificationScheduler.syncNow()
    }

    override fun onDestroy() {
        scope.coroutineContext.cancel()
        super.onDestroy()
    }
}
