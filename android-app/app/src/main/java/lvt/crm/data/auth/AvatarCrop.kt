package lvt.crm.data.auth

import kotlin.math.max
import kotlin.math.min

object AvatarCrop {
    const val MIN_ZOOM = 1f
    const val MAX_ZOOM = 4f

    fun coverScale(imageWidth: Float, imageHeight: Float, cropSize: Float): Float {
        val smallest = min(imageWidth, imageHeight)
        if (smallest <= 0f || cropSize <= 0f) return 1f
        return cropSize / smallest
    }

    fun clampZoom(zoom: Float): Float = zoom.coerceIn(MIN_ZOOM, MAX_ZOOM)

    fun displayWidth(imageWidth: Float, imageHeight: Float, cropSize: Float, zoom: Float): Float =
        imageWidth * coverScale(imageWidth, imageHeight, cropSize) * clampZoom(zoom)

    fun displayHeight(imageWidth: Float, imageHeight: Float, cropSize: Float, zoom: Float): Float =
        imageHeight * coverScale(imageWidth, imageHeight, cropSize) * clampZoom(zoom)

    fun scale(imageWidth: Float, imageHeight: Float, cropSize: Float, zoom: Float): Float =
        coverScale(imageWidth, imageHeight, cropSize) * clampZoom(zoom)

    fun clampOffset(
        offsetX: Float,
        offsetY: Float,
        displayWidth: Float,
        displayHeight: Float,
        cropSize: Float,
    ): Pair<Float, Float> {
        val minX = min(0f, cropSize - displayWidth)
        val minY = min(0f, cropSize - displayHeight)
        return offsetX.coerceIn(minX, 0f) to offsetY.coerceIn(minY, 0f)
    }

    fun centeredOffset(displayWidth: Float, displayHeight: Float, cropSize: Float): Pair<Float, Float> =
        clampOffset(
            (cropSize - displayWidth) / 2f,
            (cropSize - displayHeight) / 2f,
            displayWidth,
            displayHeight,
            cropSize,
        )

    fun offsetAfterZoom(
        imageWidth: Float,
        imageHeight: Float,
        cropSize: Float,
        oldZoom: Float,
        newZoom: Float,
        offsetX: Float,
        offsetY: Float,
        focusX: Float = cropSize / 2f,
        focusY: Float = cropSize / 2f,
    ): Pair<Float, Float> {
        val oldScale = scale(imageWidth, imageHeight, cropSize, oldZoom)
        val nextZoom = clampZoom(newZoom)
        val nextScale = scale(imageWidth, imageHeight, cropSize, nextZoom)
        if (oldScale <= 0f) {
            return centeredOffset(
                displayWidth(imageWidth, imageHeight, cropSize, nextZoom),
                displayHeight(imageWidth, imageHeight, cropSize, nextZoom),
                cropSize,
            )
        }
        return clampOffset(
            focusX - ((focusX - offsetX) / oldScale) * nextScale,
            focusY - ((focusY - offsetY) / oldScale) * nextScale,
            displayWidth(imageWidth, imageHeight, cropSize, nextZoom),
            displayHeight(imageWidth, imageHeight, cropSize, nextZoom),
            cropSize,
        )
    }

    data class SourceRect(val x: Float, val y: Float, val size: Float)

    fun sourceCropRect(
        imageWidth: Float,
        imageHeight: Float,
        cropSize: Float,
        zoom: Float,
        offsetX: Float,
        offsetY: Float,
    ): SourceRect {
        val drawnScale = scale(imageWidth, imageHeight, cropSize, zoom)
        val size = cropSize / drawnScale
        return clampSourceRect(imageWidth, imageHeight, -offsetX / drawnScale, -offsetY / drawnScale, size)
    }

    fun clampSourceRect(
        imageWidth: Float,
        imageHeight: Float,
        x: Float,
        y: Float,
        size: Float,
    ): SourceRect {
        val maxSquare = min(imageWidth, imageHeight)
        val square = size.coerceIn(1f, maxSquare)
        return SourceRect(
            x.coerceIn(0f, max(0f, imageWidth - square)),
            y.coerceIn(0f, max(0f, imageHeight - square)),
            square,
        )
    }
}
