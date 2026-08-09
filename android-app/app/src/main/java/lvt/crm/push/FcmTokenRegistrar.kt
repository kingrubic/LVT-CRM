package lvt.crm.push

import android.content.Context
import com.google.firebase.messaging.FirebaseMessaging
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import lvt.crm.BuildConfig
import lvt.crm.data.auth.TokenStore
import lvt.crm.data.convex.ConvexHttpClient
import org.json.JSONObject

class FcmTokenRegistrar(
    context: Context,
    private val tokenStore: TokenStore,
    private val convex: ConvexHttpClient,
) {
    private val appContext = context.applicationContext

    suspend fun sync() {
        if (tokenStore.accessToken.isNullOrBlank()) return
        register(currentToken())
    }

    suspend fun register(token: String) {
        if (tokenStore.accessToken.isNullOrBlank() || token.isBlank()) return
        convex.mutation(
            "push:registerToken",
            JSONObject()
                .put("token", token)
                .put("appId", BuildConfig.APPLICATION_ID),
        )
    }

    suspend fun unregister(accessToken: String) {
        if (accessToken.isBlank()) return
        convex.mutationWithToken(
            "push:unregisterToken",
            JSONObject().put("token", currentToken()),
            accessToken,
        )
    }

    private suspend fun currentToken(): String =
        suspendCancellableCoroutine { continuation ->
            FirebaseMessaging.getInstance().token
                .addOnCompleteListener { task ->
                    if (!continuation.isActive) return@addOnCompleteListener
                    when {
                        task.isSuccessful -> continuation.resume(task.result.orEmpty())
                        task.isCanceled -> continuation.cancel()
                        else -> continuation.resumeWithException(
                            task.exception ?: IllegalStateException("FCM_TOKEN_FAILED"),
                        )
                    }
                }
        }
}
