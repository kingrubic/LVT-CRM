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
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import lvt.crm.R

@Composable
fun ProfileScreen(
    name: String,
    email: String,
    onSignOut: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp),
        verticalArrangement = Arrangement.Top,
    ) {
        Text(stringResource(R.string.nav_profile), style = MaterialTheme.typography.headlineSmall)
        Spacer(Modifier = Modifier.height(16.dp))
        Text(name, style = MaterialTheme.typography.titleMedium)
        Text(
            email,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f),
        )
        Spacer(Modifier = Modifier.height(24.dp))
        Button(
            onClick = { /* Wire Convex change-password next */ },
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text(stringResource(R.string.change_password))
        }
        Spacer(Modifier = Modifier.height(12.dp))
        OutlinedButton(
            onClick = onSignOut,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text(stringResource(R.string.sign_out))
        }
        Spacer(Modifier = Modifier.height(24.dp))
        Text(
            "Admin/Mod dùng app giống user: không có Quản trị hệ thống / thiết lập tối cao.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
        )
    }
}
