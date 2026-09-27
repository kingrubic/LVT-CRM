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
    fun chatNotificationsStayOnTheirTabAndOpenTheThread() {
        val duty = NotificationDestination("duty", "duty_chat", "duty-1", "key")
        assertEquals("duties", duty.route)
        assertTrue(duty.opensChat)
        val work = NotificationDestination("work", "work_chat", "doc-1", "key")
        assertEquals("work", work.route)
        assertTrue(work.opensChat)
        assertFalse(NotificationDestination("duty", "duty_assigned", "duty-1", null).opensChat)
        assertFalse(NotificationDestination.opensChat("personal_task"))
    }
}
