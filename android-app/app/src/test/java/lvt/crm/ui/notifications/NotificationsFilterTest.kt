package lvt.crm.ui.notifications

import lvt.crm.data.notifications.NotificationItem
import org.junit.Assert.assertEquals
import org.junit.Test

class NotificationsFilterTest {
    @Test
    fun unreadFilterKeepsOnlyUnreadNotifications() {
        val unread = notification("unread", read = false)
        val read = notification("read", read = true)

        assertEquals(listOf(unread), visibleNotifications(listOf(unread, read), unreadOnly = true))
    }

    @Test
    fun disabledFilterKeepsAllNotifications() {
        val items = listOf(
            notification("unread", read = false),
            notification("read", read = true),
        )

        assertEquals(items, visibleNotifications(items, unreadOnly = false))
    }

    private fun notification(key: String, read: Boolean) = NotificationItem(
        key = key,
        kind = "work",
        sourceType = "personal_task",
        sourceId = key,
        title = key,
        description = "",
        dueAt = 0L,
        milestoneHours = 48,
        milestoneLabel = "Còn 48 giờ",
        read = read,
    )
}
