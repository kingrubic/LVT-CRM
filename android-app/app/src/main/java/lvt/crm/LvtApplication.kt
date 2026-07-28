package lvt.crm

import android.app.Application
import lvt.crm.push.NotificationCenter

class LvtApplication : Application() {
    lateinit var container: AppContainer
        private set

    override fun onCreate() {
        super.onCreate()
        NotificationCenter.createChannel(this)
        container = AppContainer(this)
    }
}
