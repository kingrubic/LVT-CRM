package lvt.crm.update

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class PlayStoreUpdatePolicyTest {
    @Test
    fun availableImmediateUpdateMustStart() {
        assertTrue(
            PlayStoreUpdatePolicy.shouldStartImmediateUpdate(
                updateAvailable = true,
                immediateAllowed = true,
                developerTriggeredInProgress = false,
            ),
        )
    }

    @Test
    fun inProgressUpdateMustResume() {
        assertTrue(
            PlayStoreUpdatePolicy.shouldStartImmediateUpdate(
                updateAvailable = false,
                immediateAllowed = true,
                developerTriggeredInProgress = true,
            ),
        )
    }

    @Test
    fun noUpdateDoesNotStart() {
        assertFalse(
            PlayStoreUpdatePolicy.shouldStartImmediateUpdate(
                updateAvailable = false,
                immediateAllowed = true,
                developerTriggeredInProgress = false,
            ),
        )
    }

    @Test
    fun availableButImmediateDisallowedDoesNotStart() {
        assertFalse(
            PlayStoreUpdatePolicy.shouldStartImmediateUpdate(
                updateAvailable = true,
                immediateAllowed = false,
                developerTriggeredInProgress = false,
            ),
        )
    }
}
