package lvt.crm.data.auth

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class AvatarCropTest {
    @Test
    fun coverZoomCropsCenteredSquareFromLandscape() {
        val cropSize = 200f
        val imageWidth = 800f
        val imageHeight = 400f
        val displayW = AvatarCrop.displayWidth(imageWidth, imageHeight, cropSize, 1f)
        val displayH = AvatarCrop.displayHeight(imageWidth, imageHeight, cropSize, 1f)
        val offset = AvatarCrop.centeredOffset(displayW, displayH, cropSize)
        val rect = AvatarCrop.sourceCropRect(imageWidth, imageHeight, cropSize, 1f, offset.first, offset.second)
        assertEquals(400f, displayW, 0.01f)
        assertEquals(200f, displayH, 0.01f)
        assertEquals(-100f, offset.first, 0.01f)
        assertEquals(0f, offset.second, 0.01f)
        assertEquals(200f, rect.x, 0.01f)
        assertEquals(0f, rect.y, 0.01f)
        assertEquals(400f, rect.size, 0.01f)
    }

    @Test
    fun zoomInShrinksSourceSquareAroundCenter() {
        val cropSize = 200f
        val imageWidth = 800f
        val imageHeight = 400f
        val zoom = 2f
        val offset = AvatarCrop.centeredOffset(
            AvatarCrop.displayWidth(imageWidth, imageHeight, cropSize, zoom),
            AvatarCrop.displayHeight(imageWidth, imageHeight, cropSize, zoom),
            cropSize,
        )
        val rect = AvatarCrop.sourceCropRect(imageWidth, imageHeight, cropSize, zoom, offset.first, offset.second)
        assertEquals(300f, rect.x, 0.01f)
        assertEquals(100f, rect.y, 0.01f)
        assertEquals(200f, rect.size, 0.01f)
    }

    @Test
    fun clampKeepsCropInsideImage() {
        val clamped = AvatarCrop.clampOffset(50f, 50f, 400f, 200f, 200f)
        assertEquals(0f, clamped.first)
        assertEquals(0f, clamped.second)
        val other = AvatarCrop.clampOffset(-999f, -999f, 400f, 200f, 200f)
        assertEquals(-200f, other.first)
        assertEquals(0f, other.second)
    }

    @Test
    fun sourceRectIsAlwaysSquareAndInsideBounds() {
        val rect = AvatarCrop.sourceCropRect(640f, 480f, 180f, 1.5f, -40f, -10f)
        assertEquals(rect.size, rect.size)
        assertTrue(rect.x >= 0f)
        assertTrue(rect.y >= 0f)
        assertTrue(rect.x + rect.size <= 640f + 0.01f)
        assertTrue(rect.y + rect.size <= 480f + 0.01f)
    }
}
