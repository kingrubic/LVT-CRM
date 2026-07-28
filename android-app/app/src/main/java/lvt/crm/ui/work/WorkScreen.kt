package lvt.crm.ui.work

import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import lvt.crm.R
import lvt.crm.ui.home.PlaceholderScreen

@Composable
fun WorkScreen() {
    PlaceholderScreen(
        title = stringResource(R.string.nav_work),
        body = stringResource(R.string.coming_soon) +
            "\n\nMàn native công việc được giao + hoàn thành / chờ duyệt.",
    )
}
