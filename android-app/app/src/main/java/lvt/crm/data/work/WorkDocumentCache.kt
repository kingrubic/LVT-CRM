package lvt.crm.data.work

import java.io.File
import java.security.MessageDigest

internal class WorkDocumentCache(
    private val directory: File,
    private val ttlMs: Long = 24L * 60L * 60L * 1000L,
    private val maxBytes: Long = 1024L * 1024L * 1024L,
) {
    fun cachedFile(sourceIdentity: String): File? {
        val key = cacheKey(sourceIdentity)
        val candidate = existingFile(key) ?: return null
        if (!isValid(candidate)) {
            removeFiles(key)
            return null
        }
        candidate.setLastModified(System.currentTimeMillis())
        return candidate
    }

    fun store(downloaded: File, sourceIdentity: String, fileName: String): File {
        directory.mkdirs()
        val key = cacheKey(sourceIdentity)
        removeFiles(key)
        val destination = File(directory, "$key.${safeExtension(fileName)}")
        if (destination.exists()) destination.delete()
        if (!downloaded.renameTo(destination)) {
            downloaded.copyTo(destination, overwrite = true)
            downloaded.delete()
        }
        if (destination.length() <= 0L) {
            destination.delete()
            throw IllegalStateException("WORK_FILE_EMPTY")
        }
        destination.setLastModified(System.currentTimeMillis())
        prune()
        return destination
    }

    companion object {
        fun cacheKey(sourceIdentity: String): String {
            val digest = MessageDigest.getInstance("SHA-256").digest(sourceIdentity.toByteArray())
            return digest.joinToString("") { "%02x".format(it) }
        }
    }

    private fun existingFile(key: String): File? {
        val files = directory.listFiles { file -> file.isFile && file.name.startsWith("$key.") } ?: return null
        return files.maxByOrNull { it.lastModified() }
    }

    private fun isValid(file: File): Boolean {
        if (!file.isFile || file.length() <= 0L) return false
        return System.currentTimeMillis() - file.lastModified() < ttlMs
    }

    private fun removeFiles(key: String) {
        directory.listFiles { file -> file.isFile && file.name.startsWith("$key.") }
            ?.forEach { it.delete() }
    }

    private fun prune() {
        val files = directory.listFiles { file -> file.isFile }?.sortedBy { it.lastModified() } ?: return
        val now = System.currentTimeMillis()
        files.filter { now - it.lastModified() >= ttlMs }.forEach { it.delete() }
        var total = directory.listFiles()?.sumOf { it.length() } ?: 0L
        val remaining = directory.listFiles { file -> file.isFile }?.sortedBy { it.lastModified() } ?: return
        for (file in remaining) {
            if (total <= maxBytes) break
            total -= file.length()
            file.delete()
        }
    }

    private fun safeExtension(fileName: String): String {
        val ext = fileName.substringAfterLast('.', "").lowercase().filter { it.isLetterOrDigit() }.take(8)
        return ext.ifBlank { "bin" }
    }
}
