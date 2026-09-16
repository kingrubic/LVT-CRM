package lvt.crm.ui.components

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class AccountHeaderTest {
    @Test
    fun initialsUseFirstAndLastWord() {
        assertEquals("NL", accountInitials("Nguyễn Thị Lan", "lan@example.com"))
    }

    @Test
    fun initialsFallbackToEmailAndDefault() {
        assertEquals("VA", accountInitials("Văn An", ""))
        assertEquals("AN", accountInitials("An", "an@example.com"))
        assertEquals("A", accountInitials("  ", "an@example.com"))
        assertEquals("L", accountInitials("", ""))
    }

    @Test
    fun avatarFileNamesAcceptCommonImageExtensions() {
        assertEquals(true, lvt.crm.data.auth.AvatarFile.isAllowedFileName("avatar.jpg"))
        assertEquals(true, lvt.crm.data.auth.AvatarFile.isAllowedFileName("me.PNG"))
        assertEquals(true, lvt.crm.data.auth.AvatarFile.isAllowedFileName("photo.webp"))
        assertEquals(false, lvt.crm.data.auth.AvatarFile.isAllowedFileName("notes.pdf"))
        assertEquals(false, lvt.crm.data.auth.AvatarFile.isAllowedFileName("avatar"))
    }

    @Test
    fun unreadBadgeHidesWhenZeroAndCapsAt99() {
        assertNull(unreadBadgeText(0))
        assertEquals("1", unreadBadgeText(1))
        assertEquals("99", unreadBadgeText(99))
        assertEquals("99+", unreadBadgeText(100))
    }
}
