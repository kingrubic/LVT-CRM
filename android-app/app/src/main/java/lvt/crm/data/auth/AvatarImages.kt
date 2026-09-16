package lvt.crm.data.auth

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import java.io.ByteArrayOutputStream
import kotlin.math.max

fun decodeAvatarBitmap(bytes: ByteArray): Bitmap? {
    if (bytes.isEmpty()) return null
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
    val largest = max(bounds.outWidth, bounds.outHeight)
    var sample = 1
    while (largest / sample > AvatarFile.MAX_EDGE * 2) sample *= 2
    val options = BitmapFactory.Options().apply { inSampleSize = sample }
    return BitmapFactory.decodeByteArray(bytes, 0, bytes.size, options)
}

fun prepareAvatarJpeg(bitmap: Bitmap): ByteArray {
    val largest = max(bitmap.width, bitmap.height).coerceAtLeast(1)
    val scaled = if (largest > AvatarFile.MAX_EDGE) {
        val scale = AvatarFile.MAX_EDGE.toFloat() / largest
        Bitmap.createScaledBitmap(
            bitmap,
            (bitmap.width * scale).toInt().coerceAtLeast(1),
            (bitmap.height * scale).toInt().coerceAtLeast(1),
            true,
        )
    } else {
        bitmap
    }
    var quality = 85
    val out = ByteArrayOutputStream()
    do {
        out.reset()
        scaled.compress(Bitmap.CompressFormat.JPEG, quality, out)
        quality -= 10
    } while (out.size() > AvatarFile.MAX_BYTES && quality >= 50)
    if (out.size() > AvatarFile.MAX_BYTES) {
        throw IllegalArgumentException("AVATAR_FILE_TOO_LARGE")
    }
    return out.toByteArray()
}
