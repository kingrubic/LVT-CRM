package lvt.crm.push

import org.junit.Assert.assertEquals
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
}
