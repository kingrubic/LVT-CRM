package lvt.crm.ui.profile

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import lvt.crm.R
import lvt.crm.data.auth.AuthRepository
import lvt.crm.ui.auth.ChangePasswordScreen

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
            subtitle = "Đặt mật khẩu mới cho tài khoản của bạn.",
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
            .padding(24.dp),
        verticalArrangement = Arrangement.Top,
    ) {
        Text(stringResource(R.string.nav_profile), style = MaterialTheme.typography.headlineSmall)
        Spacer(modifier = Modifier.height(16.dp))
        Text(name, style = MaterialTheme.typography.titleMedium)
        Text(
            email,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f),
        )
        Spacer(modifier = Modifier.height(8.dp))
        Text(
            roleLabel(role),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.65f),
        )
        if (!departmentName.isNullOrBlank()) {
            Text(
                "Phòng ban: $departmentName",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.65f),
            )
        }
        if (!positionName.isNullOrBlank()) {
            Text(
                "Chức vụ: $positionName",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.65f),
            )
        }
        Spacer(modifier = Modifier.height(24.dp))
        Button(
            onClick = { changingPassword = true },
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text(stringResource(R.string.change_password))
        }
        Spacer(modifier = Modifier.height(12.dp))
        OutlinedButton(
            onClick = onSignOut,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text(stringResource(R.string.sign_out))
        }
        Spacer(modifier = Modifier.height(24.dp))
        Text(
            "Admin/Mod dùng app giống user: không có Quản trị hệ thống / thiết lập tối cao.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
        )
    }
}

private fun roleLabel(role: String): String = when (role) {
    "admin" -> "Vai trò: Admin"
    "moderator" -> "Vai trò: Moderator"
    else -> "Vai trò: Nhân sự"
}
