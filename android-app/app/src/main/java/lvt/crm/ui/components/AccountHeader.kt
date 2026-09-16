package lvt.crm.ui.components

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Notifications
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import android.graphics.Bitmap

data class AccountHeaderState(
    val unreadCount: Int,
    val initials: String,
    val avatarBitmap: Bitmap? = null,
    val onOpenNotifications: () -> Unit,
    val onOpenProfile: () -> Unit,
)

val LocalAccountHeader = staticCompositionLocalOf<AccountHeaderState?> { null }

fun accountInitials(name: String, email: String): String {
    val words = name.trim().split(Regex("\\s+")).filter { it.isNotEmpty() }
    val fromName = when {
        words.size >= 2 -> "${words.first().first()}${words.last().first()}"
        words.size == 1 -> words[0].take(2)
        else -> ""
    }.uppercase()
    if (fromName.isNotEmpty()) return fromName.take(2)
    val fromEmail = email.trim().firstOrNull()?.uppercaseChar()?.toString()
    return fromEmail ?: "L"
}

fun unreadBadgeText(count: Int): String? = when {
    count <= 0 -> null
    count > 99 -> "99+"
    else -> count.toString()
}

@Composable
fun AccountHeaderCluster(
    state: AccountHeaderState,
    modifier: Modifier = Modifier,
) {
    val badge = unreadBadgeText(state.unreadCount)
    Row(
        modifier = modifier
            .clip(CircleShape)
            .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.72f))
            .padding(start = 2.dp, end = 4.dp, top = 3.dp, bottom = 3.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        Box(
            modifier = Modifier
                .size(36.dp)
                .clip(CircleShape)
                .clickable(onClick = state.onOpenNotifications)
                .semantics {
                    role = Role.Button
                    contentDescription = if (badge == null) {
                        "Thông báo"
                    } else {
                        "Thông báo, ${state.unreadCount} chưa đọc"
                    }
                },
            contentAlignment = Alignment.Center,
        ) {
            BadgedBox(
                badge = {
                    if (badge != null) {
                        Badge { Text(badge) }
                    }
                },
            ) {
                Icon(
                    Icons.Outlined.Notifications,
                    contentDescription = null,
                    modifier = Modifier.size(20.dp),
                )
            }
        }
        Box(
            modifier = Modifier
                .size(28.dp)
                .clip(CircleShape)
                .background(MaterialTheme.colorScheme.primary)
                .clickable(onClick = state.onOpenProfile)
                .semantics {
                    role = Role.Button
                    contentDescription = "Cá nhân"
                },
            contentAlignment = Alignment.Center,
        ) {
            if (state.avatarBitmap != null) {
                Image(
                    bitmap = state.avatarBitmap.asImageBitmap(),
                    contentDescription = null,
                    modifier = Modifier.fillMaxSize(),
                    contentScale = ContentScale.Crop,
                )
            } else {
                Text(
                    state.initials,
                    color = MaterialTheme.colorScheme.onPrimary,
                    fontWeight = FontWeight.SemiBold,
                    fontSize = 11.sp,
                    maxLines = 1,
                )
            }
        }
    }
}
