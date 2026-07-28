package lvt.crm.ui.profile

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.Logout
import androidx.compose.material.icons.outlined.AdminPanelSettings
import androidx.compose.material.icons.outlined.Badge
import androidx.compose.material.icons.outlined.Business
import androidx.compose.material.icons.outlined.Email
import androidx.compose.material.icons.outlined.LockReset
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import lvt.crm.R
import lvt.crm.data.auth.AuthRepository
import lvt.crm.ui.auth.ChangePasswordScreen
import lvt.crm.ui.components.InfoRow
import lvt.crm.ui.components.ScreenHeader
import lvt.crm.ui.components.StatusPill
import lvt.crm.ui.components.StatusTone

@Composable
fun ProfileScreen(
    name: String,
    email: String,
    role: String,
    departmentName: String?,
    positionName: String?,
    authRepository: AuthRepository,
    onSignOut: () -> Unit,
) {
    var changingPassword by remember { mutableStateOf(false) }

    if (changingPassword) {
        ChangePasswordScreen(
            title = stringResource(R.string.change_password),
            subtitle = "Đặt mật khẩu mới để bảo vệ tài khoản của bạn.",
            authRepository = authRepository,
            allowCancel = true,
            onDone = { changingPassword = false },
            onCancel = { changingPassword = false },
        )
        return
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 18.dp),
    ) {
        ScreenHeader(
            title = stringResource(R.string.nav_profile),
            subtitle = "Hồ sơ và bảo mật tài khoản",
            icon = Icons.Outlined.Person,
        )

        Card(
            modifier = Modifier.fillMaxWidth(),
            shape = MaterialTheme.shapes.large,
            colors = CardDefaults.cardColors(
                containerColor = MaterialTheme.colorScheme.primaryContainer,
            ),
        ) {
            Row(
                modifier = Modifier.padding(20.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                Box(
                    modifier = Modifier
                        .size(68.dp)
                        .clip(CircleShape)
                        .background(MaterialTheme.colorScheme.primary),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        name.trim().firstOrNull()?.uppercase() ?: "L",
                        style = MaterialTheme.typography.headlineMedium,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onPrimary,
                    )
                }
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        name.ifBlank { email },
                        style = MaterialTheme.typography.titleLarge,
                        color = MaterialTheme.colorScheme.onPrimaryContainer,
                    )
                    Text(
                        email,
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onPrimaryContainer.copy(alpha = 0.76f),
                        modifier = Modifier.padding(top = 3.dp, bottom = 8.dp),
                    )
                    StatusPill(
                        label = roleLabel(role),
                        tone = StatusTone.Positive,
                    )
                }
            }
        }

        Spacer(modifier = Modifier.height(16.dp))
        Card(
            modifier = Modifier.fillMaxWidth(),
            shape = MaterialTheme.shapes.medium,
            colors = CardDefaults.cardColors(
                containerColor = MaterialTheme.colorScheme.surface,
            ),
            elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
        ) {
            Column(modifier = Modifier.padding(horizontal = 18.dp, vertical = 10.dp)) {
                InfoRow(
                    icon = Icons.Outlined.Email,
                    label = "Email đăng nhập",
                    value = email,
                )
                departmentName?.takeIf { it.isNotBlank() }?.let {
                    InfoRow(
                        icon = Icons.Outlined.Business,
                        label = "Phòng ban",
                        value = it,
                    )
                }
                positionName?.takeIf { it.isNotBlank() }?.let {
                    InfoRow(
                        icon = Icons.Outlined.Badge,
                        label = "Chức vụ",
                        value = it,
                    )
                }
                InfoRow(
                    icon = Icons.Outlined.AdminPanelSettings,
                    label = "Quyền trên ứng dụng",
                    value = "Theo vai trò và nhóm quyền được phân công",
                )
            }
        }

        Spacer(modifier = Modifier.height(20.dp))
        Button(
            onClick = { changingPassword = true },
            modifier = Modifier
                .fillMaxWidth()
                .height(52.dp),
            shape = MaterialTheme.shapes.medium,
        ) {
            Icon(Icons.Outlined.LockReset, contentDescription = null)
            Text(
                stringResource(R.string.change_password),
                modifier = Modifier.padding(start = 8.dp),
            )
        }
        Spacer(modifier = Modifier.height(10.dp))
        FilledTonalButton(
            onClick = onSignOut,
            modifier = Modifier
                .fillMaxWidth()
                .height(50.dp),
            shape = MaterialTheme.shapes.medium,
        ) {
            Icon(Icons.AutoMirrored.Outlined.Logout, contentDescription = null)
            Text(
                stringResource(R.string.sign_out),
                modifier = Modifier.padding(start = 8.dp),
            )
        }
        Spacer(modifier = Modifier.height(24.dp))
    }
}

private fun roleLabel(role: String): String = when (role) {
    "admin" -> "Quản trị viên"
    "moderator" -> "Điều phối viên"
    else -> "Nhân sự"
}
