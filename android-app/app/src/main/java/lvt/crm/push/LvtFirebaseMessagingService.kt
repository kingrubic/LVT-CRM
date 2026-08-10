package lvt.crm.push

import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import lvt.crm.LvtApplication

class LvtFirebaseMessagingService : FirebaseMessagingService() {
    override fun onNewToken(token: String) {
        FcmTokenRegistrationWorker.enqueue(applicationContext, token)
    }

    override fun onMessageReceived(message: RemoteMessage) {
        val application = application as? LvtApplication ?: return
        PushEvents.notifyReceived()
        application.container.notificationScheduler.syncNow()
    }
}
