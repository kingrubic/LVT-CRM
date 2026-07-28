package lvt.crm.ui.duties

import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import lvt.crm.R
import lvt.crm.ui.home.PlaceholderScreen

@Composable
fun DutiesScreen() {
    PlaceholderScreen(
        title = stringResource(R.string.nav_duties),
        body = stringResource(R.string.coming_soon) +
            "\n\nMàn native danh sách công tác + xác nhận tham gia (user).",
    )
}
