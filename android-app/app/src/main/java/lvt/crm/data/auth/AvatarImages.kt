package lvt.crm.data.auth

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.Rect
import android.graphics.RectF
import android.media.ExifInterface
import android.os.Build
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import kotlin.math.max
import kotlin.math.roundToInt

private const val CROP_DECODE_EDGE = 2048

fun decodeAvatarBitmap(bytes: ByteArray): Bitmap? = decodeAvatarBitmap(bytes, AvatarFile.MAX_EDGE * 2)

fun decodeAvatarBitmapForCrop(bytes: ByteArray): Bitmap? = decodeAvatarBitmap(bytes, CROP_DECODE_EDGE)

private fun decodeAvatarBitmap(bytes: ByteArray, maxEdge: Int): Bitmap? {
    if (bytes.isEmpty()) return null
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
    val largest = max(bounds.outWidth, bounds.outHeight)
    var sample = 1
    while (largest / sample > maxEdge) sample *= 2
    val options = BitmapFactory.Options().apply { inSampleSize = sample }
    val bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.size, options) ?: return null
    return applyExifOrientation(bytes, bitmap)
}

private fun applyExifOrientation(bytes: ByteArray, bitmap: Bitmap): Bitmap {
    val orientation = runCatching {
        ExifInterface(ByteArrayInputStream(bytes)).getAttributeInt(
            ExifInterface.TAG_ORIENTATION,
            ExifInterface.ORIENTATION_NORMAL,
        )
    }.getOrDefault(ExifInterface.ORIENTATION_NORMAL)
    val matrix = Matrix()
    when (orientation) {
        ExifInterface.ORIENTATION_ROTATE_90 -> matrix.postRotate(90f)
        ExifInterface.ORIENTATION_ROTATE_180 -> matrix.postRotate(180f)
        ExifInterface.ORIENTATION_ROTATE_270 -> matrix.postRotate(270f)
        ExifInterface.ORIENTATION_FLIP_HORIZONTAL -> matrix.preScale(-1f, 1f)
        ExifInterface.ORIENTATION_FLIP_VERTICAL -> matrix.preScale(1f, -1f)
        ExifInterface.ORIENTATION_TRANSPOSE -> {
            matrix.postRotate(90f)
            matrix.preScale(-1f, 1f)
        }
        ExifInterface.ORIENTATION_TRANSVERSE -> {
            matrix.postRotate(270f)
            matrix.preScale(-1f, 1f)
        }
        else -> return bitmap
    }
    return Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, matrix, true).also {
        if (it !== bitmap) bitmap.recycle()
    }
}

fun cropAvatarBitmap(
    source: Bitmap,
    cropSize: Float,
    zoom: Float,
    offsetX: Float,
    offsetY: Float,
    outputEdge: Int = AvatarFile.MAX_EDGE,
): Bitmap {
    val rect = AvatarCrop.sourceCropRect(
        source.width.toFloat(),
        source.height.toFloat(),
        cropSize,
        zoom,
        offsetX,
        offsetY,
    )
    val left = rect.x.roundToInt().coerceIn(0, source.width)
    val top = rect.y.roundToInt().coerceIn(0, source.height)
    val right = (rect.x + rect.size).roundToInt().coerceIn(left + 1, source.width)
    val bottom = (rect.y + rect.size).roundToInt().coerceIn(top + 1, source.height)
    val src = Rect(left, top, right, bottom)
    val edge = outputEdge.coerceAtLeast(1)
    val out = Bitmap.createBitmap(edge, edge, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(out)
    val paint = Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG)
    canvas.drawBitmap(source, src, RectF(0f, 0f, edge.toFloat(), edge.toFloat()), paint)
    return out
}

fun prepareAvatarWebP(bitmap: Bitmap): ByteArray {
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
    val format = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
        Bitmap.CompressFormat.WEBP_LOSSY
    } else {
        @Suppress("DEPRECATION")
        Bitmap.CompressFormat.WEBP
    }
    var quality = 82
    val out = ByteArrayOutputStream()
    do {
        out.reset()
        scaled.compress(format, quality, out)
        quality -= 10
    } while (out.size() > AvatarFile.MAX_BYTES && quality >= 45)
    if (out.size() > AvatarFile.MAX_BYTES) {
        throw IllegalArgumentException("AVATAR_FILE_TOO_LARGE")
    }
    return out.toByteArray()
}
