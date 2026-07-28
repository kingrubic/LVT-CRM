package lvt.crm

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Surface
import androidx.compose.ui.Modifier
import lvt.crm.ui.LvtRoot
import lvt.crm.ui.theme.LvtCrmTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        val container = (application as LvtApplication).container
        setContent {
            LvtCrmTheme {
                Surface(modifier = Modifier.fillMaxSize()) {
                    LvtRoot(container = container)
                }
            }
        }
    }
}
