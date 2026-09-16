package lvt.crm.data.auth

import android.graphics.Bitmap
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.withContext
import lvt.crm.data.convex.ConvexConfig
import lvt.crm.data.convex.ConvexException
import lvt.crm.data.convex.ConvexHttpClient
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.io.File
import java.util.concurrent.TimeUnit

class AvatarRepository(
    private val convex: ConvexHttpClient,
    private val tokenProvider: () -> String?,
    cacheDir: File,
) {
    private val cacheRoot = File(cacheDir, "avatars").apply { mkdirs() }
    private val _bitmap = MutableStateFlow<Bitmap?>(null)
    val bitmap: StateFlow<Bitmap?> = _bitmap.asStateFlow()
    private val http = OkHttpClient.Builder()
        .connectTimeout(20, TimeUnit.SECONDS)
        .readTimeout(45, TimeUnit.SECONDS)
        .writeTimeout(45, TimeUnit.SECONDS)
        .build()

    suspend fun sync(userId: String, hasAvatar: Boolean, avatarVersion: String?) = withContext(Dispatchers.IO) {
        if (userId.isBlank() || !hasAvatar) {
            _bitmap.value = null
            return@withContext
        }
        val version = avatarVersion?.takeIf { it.isNotBlank() } ?: "current"
        val cached = File(cacheRoot, "${userId.hashCode()}-$version.jpg")
        if (cached.isFile && cached.length() > 0) {
            _bitmap.value = decodeAvatarBitmap(cached.readBytes())
            return@withContext
        }
        val token = tokenProvider()?.takeIf { it.isNotBlank() } ?: return@withContext
        val base = ConvexConfig.webUrl.trimEnd('/')
        val metadataRequest = Request.Builder()
            .url("$base/api/files/avatar/metadata")
            .header("Authorization", "Bearer $token")
            .get()
            .build()
        val metadata = http.newCall(metadataRequest).execute().use { response ->
            val body = response.body?.string().orEmpty()
            if (!response.isSuccessful) return@withContext
            runCatching { JSONObject(body) }.getOrNull()
        } ?: return@withContext
        val remoteVersion = metadata.optString("fileVersion").ifBlank { version }
        val versioned = File(cacheRoot, "${userId.hashCode()}-$remoteVersion.jpg")
        if (versioned.isFile && versioned.length() > 0) {
            _bitmap.value = decodeAvatarBitmap(versioned.readBytes())
            return@withContext
        }
        val request = Request.Builder()
            .url("$base/api/files/avatar")
            .header("Authorization", "Bearer $token")
            .get()
            .build()
        val bytes = http.newCall(request).execute().use { response ->
            if (!response.isSuccessful) return@withContext
            response.body?.bytes()
        } ?: return@withContext
        if (bytes.isEmpty()) return@withContext
        runCatching {
            versioned.parentFile?.mkdirs()
            versioned.writeBytes(bytes)
        }
        _bitmap.value = decodeAvatarBitmap(bytes)
    }

    suspend fun upload(bytes: ByteArray, fileName: String = "avatar.webp"): Result<Unit> =
        withContext(Dispatchers.IO) {
            runCatching {
                if (bytes.isEmpty()) throw ConvexException("INVALID_AVATAR_FILE", "INVALID_AVATAR_FILE")
                if (bytes.size > AvatarFile.MAX_BYTES) {
                    throw ConvexException("AVATAR_FILE_TOO_LARGE", "AVATAR_FILE_TOO_LARGE")
                }
                val contentType = when {
                    fileName.endsWith(".png", ignoreCase = true) -> "image/png"
                    fileName.endsWith(".jpg", ignoreCase = true) ||
                        fileName.endsWith(".jpeg", ignoreCase = true) -> "image/jpeg"
                    else -> "image/webp"
                }
                val uploadUrl = convex.mutation("userAvatar:generateUploadUrl").optString("value")
                if (uploadUrl.isBlank()) throw ConvexException("AVATAR_UPLOAD_FAILED", "AVATAR_UPLOAD_FAILED")
                val uploaded = http.newCall(
                    Request.Builder()
                        .url(uploadUrl)
                        .post(bytes.toRequestBody(contentType.toMediaType()))
                        .build(),
                ).execute().use { response ->
                    val body = response.body?.string().orEmpty()
                    if (!response.isSuccessful) {
                        throw ConvexException("AVATAR_UPLOAD_FAILED", "AVATAR_UPLOAD_FAILED")
                    }
                    JSONObject(body)
                }
                val storageId = uploaded.optString("storageId")
                if (storageId.isBlank()) throw ConvexException("AVATAR_UPLOAD_FAILED", "AVATAR_UPLOAD_FAILED")
                convex.action(
                    "userAvatar:setOwnAvatar",
                    JSONObject()
                        .put("storageId", storageId)
                        .put("fileName", fileName)
                        .put("fileSize", bytes.size),
                )
                _bitmap.value = decodeAvatarBitmap(bytes)
            }
        }

    suspend fun clear(): Result<Unit> = withContext(Dispatchers.IO) {
        runCatching {
            convex.mutation("userAvatar:clearOwnAvatar")
            _bitmap.value = null
        }
    }

    fun clearLocal() {
        _bitmap.value = null
    }
}
