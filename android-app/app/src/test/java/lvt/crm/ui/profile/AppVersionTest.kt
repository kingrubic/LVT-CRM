package lvt.crm.ui.profile

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AppVersionTest {
    @Test
    fun marketingVersionIsSemverWithoutBuildSuffix() {
        val version = currentAppVersion()
        assertTrue(version.matches(Regex("""\d+\.\d+\.\d+""")))
        assertFalse(version.contains("-"))
    }
}
