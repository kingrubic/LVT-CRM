package lvt.crm.ui.profile

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class AppChangelogTest {
    @Test
    fun visibleEntriesHideNewerThanInstalledVersion() {
        val visible = AppChangelog.visibleEntries("0.11.0").map { it.version }
        assertTrue(visible.contains("0.11.0"))
        assertTrue(visible.contains("0.10.0"))
        assertTrue(!visible.contains("0.12.0"))
    }

    @Test
    fun currentMarketingVersionHasAChangelogEntry() {
        val current = currentAppVersion()
        val versions = AppChangelog.visibleEntries(current).map { it.version }
        assertTrue(versions.contains(current))
        assertEquals(current, versions.first())
    }

    @Test
    fun compareVersionsOrdersSemver() {
        assertTrue(compareVersions("0.12.0", "0.11.0") > 0)
        assertTrue(compareVersions("1.0", "1.0.0") == 0)
        assertTrue(compareVersions("0.8.2", "0.9.0") < 0)
    }
}
