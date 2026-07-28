package lvt.crm.ui.notifications

import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import lvt.crm.R
import lvt.crm.ui.home.PlaceholderScreen

@Composable
fun NotificationsScreen() {
    PlaceholderScreen(
        title = stringResource(R.string.nav_notifications),
        body = stringResource(R.string.coming_soon) +
            "\n\nSau khi xong Công tác / Công việc sẽ gắn FCM + deep link mở đúng item.",
    )
}
