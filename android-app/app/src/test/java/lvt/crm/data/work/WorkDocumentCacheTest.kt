package lvt.crm.data.work

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File
import kotlin.io.path.createTempDirectory

class WorkDocumentCacheTest {
    @Test
    fun storesAndReusesNonEmptyFile() {
        val dir = createTempDirectory("lvt-work-cache").toFile()
        val cache = WorkDocumentCache(dir)
        val source = File.createTempFile("src", ".pdf").apply { writeText("cong-van") }
        val stored = cache.store(source, "private:doc-1:v1", "cong-van.pdf")
        assertTrue(stored.exists())
        assertEquals("cong-van", stored.readText())
        val cached = cache.cachedFile("private:doc-1:v1")
        assertEquals(stored.canonicalPath, cached?.canonicalPath)
    }

    @Test
    fun cacheKeyIsStable() {
        assertEquals(
            WorkDocumentCache.cacheKey("private:doc:v1"),
            WorkDocumentCache.cacheKey("private:doc:v1"),
        )
    }
}
