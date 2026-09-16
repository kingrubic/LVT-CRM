package lvt.crm.ui.profile

import android.graphics.Bitmap
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathFillType
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import lvt.crm.data.auth.AvatarCrop
import lvt.crm.data.auth.cropAvatarBitmap
import kotlin.math.roundToInt

private val CropBackground = Color(0xFF242526)
private val FacebookBlue = Color(0xFF1B74E4)

private class AvatarCropSession {
    var cropSize = 0
    var zoom by mutableFloatStateOf(AvatarCrop.MIN_ZOOM)
    var offsetX by mutableFloatStateOf(0f)
    var offsetY by mutableFloatStateOf(0f)
}

@Composable
fun AvatarCropScreen(
    bitmap: Bitmap,
    onCancel: () -> Unit,
    onConfirm: (Bitmap) -> Unit,
) {
    BackHandler(onBack = onCancel)
    var cropSize by remember { mutableIntStateOf(0) }
    val session = remember(bitmap) { AvatarCropSession() }
    val imageWidth = bitmap.width.toFloat()
    val imageHeight = bitmap.height.toFloat()
    val zoom = session.zoom

    fun resetToCover(size: Float) {
        val centered = AvatarCrop.centeredOffset(
            AvatarCrop.displayWidth(imageWidth, imageHeight, size, AvatarCrop.MIN_ZOOM),
            AvatarCrop.displayHeight(imageWidth, imageHeight, size, AvatarCrop.MIN_ZOOM),
            size,
        )
        session.zoom = AvatarCrop.MIN_ZOOM
        session.offsetX = centered.first
        session.offsetY = centered.second
    }

    LaunchedEffect(bitmap, cropSize) {
        if (cropSize > 0) resetToCover(cropSize.toFloat())
    }

    fun applyZoom(nextZoom: Float) {
        val size = session.cropSize.toFloat()
        if (size <= 0f) return
        val next = AvatarCrop.offsetAfterZoom(
            imageWidth,
            imageHeight,
            size,
            session.zoom,
            nextZoom,
            session.offsetX,
            session.offsetY,
        )
        session.zoom = AvatarCrop.clampZoom(nextZoom)
        session.offsetX = next.first
        session.offsetY = next.second
    }

    fun applyPan(dx: Float, dy: Float) {
        val size = session.cropSize.toFloat()
        if (size <= 0f) return
        val clamped = AvatarCrop.clampOffset(
            session.offsetX + dx,
            session.offsetY + dy,
            AvatarCrop.displayWidth(imageWidth, imageHeight, size, session.zoom),
            AvatarCrop.displayHeight(imageWidth, imageHeight, size, session.zoom),
            size,
        )
        session.offsetX = clamped.first
        session.offsetY = clamped.second
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(CropBackground)
            .padding(horizontal = 16.dp, vertical = 20.dp),
    ) {
        Text(
            "Cắt ảnh",
            color = Color(0xFFF5F6F7),
            fontSize = 22.sp,
            fontWeight = FontWeight.Bold,
        )
        Spacer(Modifier.height(16.dp))
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .aspectRatio(1f)
                .background(Color.Black)
                .onSizeChanged {
                    val next = minOf(it.width, it.height)
                    cropSize = next
                    session.cropSize = next
                }
                .pointerInput(session, bitmap) {
                    detectTransformGestures { _, pan, zoomChange, _ ->
                        applyZoom(session.zoom * zoomChange)
                        applyPan(pan.x, pan.y)
                    }
                },
        ) {
            Canvas(Modifier.fillMaxSize()) {
                if (cropSize <= 0) return@Canvas
                val canvasWidth = size.width
                val canvasHeight = size.height
                val sizePx = cropSize.toFloat()
                val dstWidth = AvatarCrop.displayWidth(imageWidth, imageHeight, sizePx, session.zoom)
                val dstHeight = AvatarCrop.displayHeight(imageWidth, imageHeight, sizePx, session.zoom)
                drawImage(
                    image = bitmap.asImageBitmap(),
                    dstOffset = IntOffset(session.offsetX.roundToInt(), session.offsetY.roundToInt()),
                    dstSize = IntSize(
                        dstWidth.roundToInt().coerceAtLeast(1),
                        dstHeight.roundToInt().coerceAtLeast(1),
                    ),
                )
                val overlay = Path().apply {
                    fillType = PathFillType.EvenOdd
                    addRect(Rect(Offset.Zero, Size(canvasWidth, canvasHeight)))
                    val radius = minOf(canvasWidth, canvasHeight) / 2f
                    addOval(
                        Rect(
                            Offset(canvasWidth / 2f - radius, canvasHeight / 2f - radius),
                            Size(radius * 2f, radius * 2f),
                        ),
                    )
                }
                drawPath(overlay, Color.Black.copy(alpha = 0.58f))
            }
            Text(
                "Kéo để di chuyển ảnh",
                color = Color.White,
                fontSize = 13.sp,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier
                    .align(Alignment.TopCenter)
                    .padding(top = 14.dp)
                    .background(Color.Black.copy(alpha = 0.58f), RoundedCornerShape(10.dp))
                    .padding(horizontal = 12.dp, vertical = 8.dp),
            )
        }
        Spacer(Modifier.height(20.dp))
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            TextButton(onClick = { applyZoom(session.zoom - 0.12f) }, enabled = zoom > AvatarCrop.MIN_ZOOM) {
                Text("−", color = Color(0xFFE4E6EB), fontSize = 22.sp)
            }
            Slider(
                value = zoom,
                onValueChange = { applyZoom(it) },
                valueRange = AvatarCrop.MIN_ZOOM..AvatarCrop.MAX_ZOOM,
                modifier = Modifier.weight(1f),
                colors = SliderDefaults.colors(
                    thumbColor = FacebookBlue,
                    activeTrackColor = FacebookBlue,
                    inactiveTrackColor = Color(0xFF3A3B3C),
                ),
            )
            TextButton(onClick = { applyZoom(session.zoom + 0.12f) }, enabled = zoom < AvatarCrop.MAX_ZOOM) {
                Text("+", color = Color(0xFFE4E6EB), fontSize = 22.sp)
            }
        }
        Spacer(Modifier.weight(1f))
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.End,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            TextButton(onClick = onCancel) {
                Text("Hủy", color = FacebookBlue, fontWeight = FontWeight.Bold)
            }
            Button(
                onClick = {
                    if (cropSize <= 0) return@Button
                    onConfirm(
                        cropAvatarBitmap(
                            bitmap,
                            cropSize.toFloat(),
                            session.zoom,
                            session.offsetX,
                            session.offsetY,
                        ),
                    )
                },
                colors = ButtonDefaults.buttonColors(containerColor = FacebookBlue),
                shape = RoundedCornerShape(6.dp),
                modifier = Modifier.padding(start = 8.dp),
            ) {
                Text("Lưu", fontWeight = FontWeight.Bold)
            }
        }
        Spacer(Modifier.size(8.dp))
    }
}
