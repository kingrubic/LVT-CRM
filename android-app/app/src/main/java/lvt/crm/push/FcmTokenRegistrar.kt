package lvt.crm.push

import android.content.Context
import com.google.firebase.messaging.FirebaseMessaging
import kotlin.coroutines.resume
import kotlin.coroutines.suspendCoroutine
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
        runCatching {
            convex.mutation(
                "push:registerToken",
                JSONObject()
                    .put("token", token)
                    .put("appId", BuildConfig.APPLICATION_ID),
            )
        }
    }

    suspend fun unregister() {
        if (tokenStore.accessToken.isNullOrBlank()) return
        runCatching {
            convex.mutation(
                "push:unregisterToken",
                JSONObject().put("token", currentToken()),
            )
        }
    }

    private suspend fun currentToken(): String =
        suspendCoroutine { continuation ->
            FirebaseMessaging.getInstance().token
                .addOnCompleteListener { task ->
                    continuation.resume(task.result?.takeIf { task.isSuccessful }.orEmpty())
                }
        }
}
