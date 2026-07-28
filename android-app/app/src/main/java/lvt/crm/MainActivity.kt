package lvt.crm

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Surface
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import kotlinx.coroutines.flow.MutableStateFlow
import lvt.crm.push.NotificationDestination
import lvt.crm.ui.LvtRoot
import lvt.crm.ui.theme.LvtCrmTheme

class MainActivity : ComponentActivity() {
    private val notificationDestination = MutableStateFlow<NotificationDestination?>(null)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        notificationDestination.value = NotificationDestination.fromIntent(intent)
        val container = (application as LvtApplication).container
        setContent {
            val destination by notificationDestination.collectAsState()
            LvtCrmTheme {
                Surface(modifier = Modifier.fillMaxSize()) {
                    LvtRoot(
                        container = container,
                        notificationDestination = destination,
                        onNotificationDestinationHandled = {
                            notificationDestination.value = null
                        },
                    )
                }
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        notificationDestination.value = NotificationDestination.fromIntent(intent)
    }
}
