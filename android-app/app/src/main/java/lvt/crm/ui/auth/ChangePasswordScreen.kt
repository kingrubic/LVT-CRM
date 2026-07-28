package lvt.crm.ui.auth

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import lvt.crm.data.auth.AuthRepository
import lvt.crm.data.convex.ConvexException
import lvt.crm.data.convex.ConvexHttpClient

@Composable
fun ChangePasswordScreen(
    title: String,
    subtitle: String,
    authRepository: AuthRepository,
    allowCancel: Boolean,
    onDone: () -> Unit,
    onCancel: (() -> Unit)? = null,
) {
    var password by remember { mutableStateOf("") }
    var confirmation by remember { mutableStateOf("") }
    var loading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var success by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(title, style = MaterialTheme.typography.headlineSmall)
        Text(
            subtitle,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f),
            modifier = Modifier.padding(top = 8.dp, bottom = 20.dp),
        )

        OutlinedTextField(
            value = password,
            onValueChange = {
                password = it
                error = null
                success = null
            },
            modifier = Modifier.fillMaxWidth(),
            label = { Text("Mật khẩu mới") },
            singleLine = true,
            visualTransformation = PasswordVisualTransformation(),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
        )
        Spacer(modifier = Modifier.height(12.dp))
        OutlinedTextField(
            value = confirmation,
            onValueChange = {
                confirmation = it
                error = null
                success = null
            },
            modifier = Modifier.fillMaxWidth(),
            label = { Text("Xác nhận mật khẩu") },
            singleLine = true,
            visualTransformation = PasswordVisualTransformation(),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
        )

        Text(
            if (password.length >= 8) "Độ dài mật khẩu đã đạt yêu cầu."
            else "Mật khẩu cần tối thiểu 8 ký tự.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = 8.dp),
        )

        if (error != null) {
            Text(
                error ?: "",
                color = MaterialTheme.colorScheme.error,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 12.dp),
            )
        }
        if (success != null) {
            Text(
                success ?: "",
                color = MaterialTheme.colorScheme.primary,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 12.dp),
            )
        }

        Spacer(modifier = Modifier.height(20.dp))
        Button(
            onClick = {
                when {
                    password.length < 8 -> error = "Mật khẩu phải có ít nhất 8 ký tự."
                    password != confirmation -> error = "Xác nhận mật khẩu không khớp."
                    else -> scope.launch {
                        loading = true
                        error = null
                        success = null
                        val result = authRepository.changePassword(password)
                        loading = false
                        result.fold(
                            onSuccess = {
                                success = "Đã đổi mật khẩu."
                                onDone()
                            },
                            onFailure = { e ->
                                error = when (e) {
                                    is ConvexException -> e.message
                                    else -> ConvexHttpClient.humanize(e.message ?: "PASSWORD_CHANGE_FAILED")
                                }
                            },
                        )
                    }
                }
            },
            enabled = !loading,
            modifier = Modifier.fillMaxWidth(),
        ) {
            if (loading) {
                CircularProgressIndicator(strokeWidth = 2.dp, modifier = Modifier.size(20.dp))
            } else {
                Text("Lưu mật khẩu")
            }
        }

        if (allowCancel && onCancel != null) {
            Spacer(modifier = Modifier.height(12.dp))
            OutlinedButton(onClick = onCancel, modifier = Modifier.fillMaxWidth()) {
                Text("Hủy")
            }
        }
    }
}
