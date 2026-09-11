package lvt.crm.ui.duties

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.CalendarMonth
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import lvt.crm.data.duties.DutiesRepository
import lvt.crm.ui.components.LvtScreen

private enum class DutiesTabPage { Hub, Personal, SharedPicker }

@Composable
fun DutiesTabHost(
    viewModel: DutiesViewModel,
    dutiesRepository: DutiesRepository,
    focusId: String?,
    tabOpenToken: Int,
    openTab: DutyListTab? = null,
    openFilterToken: Int = 0,
    skipHub: Boolean = false,
) {
    var page by remember { mutableStateOf(if (skipHub || !focusId.isNullOrBlank()) DutiesTabPage.Personal else DutiesTabPage.Hub) }
    LaunchedEffect(tabOpenToken, skipHub, focusId) {
        page = if (skipHub || !focusId.isNullOrBlank()) {
            DutiesTabPage.Personal
        } else {
            DutiesTabPage.Hub
        }
    }

    when (page) {
        DutiesTabPage.Hub -> DutiesHubScreen(
            onOpenPersonal = { page = DutiesTabPage.Personal },
            onOpenShared = { page = DutiesTabPage.SharedPicker },
        )
        DutiesTabPage.Personal -> DutiesScreen(
            viewModel = viewModel,
            focusId = focusId,
            tabOpenToken = tabOpenToken,
            openTab = openTab,
            openFilterToken = openFilterToken,
            onBackToHub = if (skipHub) null else ({ page = DutiesTabPage.Hub }),
        )
        DutiesTabPage.SharedPicker -> SharedDutySchedulePickerScreen(
            dutiesRepository = dutiesRepository,
            onBack = { page = DutiesTabPage.Hub },
        )
    }
}

@Composable
fun DutiesHubScreen(
    onOpenPersonal: () -> Unit,
    onOpenShared: () -> Unit,
) {
    LvtScreen(title = "Lịch CT") {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = 20.dp),
            verticalArrangement = Arrangement.Center,
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            HubChoiceCard(
                title = "Lịch công tác cá nhân",
                subtitle = "Công tác được giao và công tác bạn tạo",
                icon = { Icon(Icons.Outlined.Person, contentDescription = null, modifier = Modifier.size(32.dp)) },
                onClick = onOpenPersonal,
            )
            Spacer(modifier = Modifier.height(16.dp))
            HubChoiceCard(
                title = "Lịch công tác chung",
                subtitle = "Xem và tải PDF lịch toàn trường",
                icon = { Icon(Icons.Outlined.CalendarMonth, contentDescription = null, modifier = Modifier.size(32.dp)) },
                onClick = onOpenShared,
            )
        }
    }
}

@Composable
private fun HubChoiceCard(
    title: String,
    subtitle: String,
    icon: @Composable () -> Unit,
    onClick: () -> Unit,
) {
    ElevatedCard(
        onClick = onClick,
        modifier = Modifier.fillMaxWidth(),
        elevation = CardDefaults.elevatedCardElevation(defaultElevation = 2.dp),
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = 20.dp, vertical = 18.dp),
            verticalArrangement = Arrangement.Center,
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            icon()
            Spacer(modifier = Modifier.height(10.dp))
            Text(title, style = MaterialTheme.typography.titleMedium, textAlign = TextAlign.Center)
            Text(
                subtitle,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
            )
        }
    }
}
