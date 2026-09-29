package lvt.crm.push

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class NotificationDestinationTest {
    @Test
    fun dutyNotificationRoutesToDuties() {
        assertEquals("duties", NotificationDestination.routeForKind("duty"))
    }

    @Test
    fun everyNonDutyNotificationRoutesToWork() {
        assertEquals("work", NotificationDestination.routeForKind("work"))
        assertEquals("work", NotificationDestination.routeForKind("approval"))
        assertEquals("work", NotificationDestination.routeForKind(""))
    }

    @Test
    fun chatNotificationsOpenTheHubThread() {
        val duty = NotificationDestination("duty", "duty_chat", "duty-1", "key")
        assertEquals("chat", duty.route)
        assertEquals("duty", duty.chatKind)
        assertTrue(duty.opensChat)
        val work = NotificationDestination("work", "work_chat", "doc-1", "key")
        assertEquals("chat", work.route)
        assertEquals("work", work.chatKind)
        assertTrue(work.opensChat)
        val group = NotificationDestination("group", "group_chat", "group-1", "key")
        assertEquals("chat", group.route)
        assertEquals("group", group.chatKind)
        assertTrue(group.opensChat)
        assertFalse(NotificationDestination("duty", "duty_assigned", "duty-1", null).opensChat)
        assertFalse(NotificationDestination.opensChat("personal_task"))
    }
}
