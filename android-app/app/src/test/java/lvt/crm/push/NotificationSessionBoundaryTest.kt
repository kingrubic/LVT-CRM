package lvt.crm.push

import lvt.crm.data.auth.CredentialSnapshot
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class NotificationSessionBoundaryTest {
    @Test
    fun `worker snapshot captured before logout cannot perform later side effects`() {
        val signedIn = CredentialSnapshot("access", "refresh", revision = 7)
        var current: CredentialSnapshot? = signedIn
        val workerSession = current
        var notificationsPosted = 0
        var historyWrites = 0

        // Logout invalidates the credential revision after the worker's initial check.
        current = null
        val accepted = NotificationSessionBoundary.runIfCurrent(
            expected = workerSession!!,
            current = { current },
        ) {
            notificationsPosted++
            historyWrites++
            true
        }

        assertNull(accepted)
        assertEquals(0, notificationsPosted)
        assertEquals(0, historyWrites)
    }

    @Test
    fun `logout cleanup leaves no side effect when delivery already owns boundary`() {
        val signedIn = CredentialSnapshot("access", "refresh", revision = 11)
        var current: CredentialSnapshot? = signedIn
        var visibleNotifications = 0
        var deliveryHistory = 0

        NotificationSessionBoundary.runIfCurrent(signedIn, { current }) {
            visibleNotifications = 1
            deliveryHistory = 1
            true
        }
        current = null
        NotificationSessionBoundary.cleanup {
            visibleNotifications = 0
            deliveryHistory = 0
        }

        assertEquals(0, visibleNotifications)
        assertEquals(0, deliveryHistory)
    }
}
