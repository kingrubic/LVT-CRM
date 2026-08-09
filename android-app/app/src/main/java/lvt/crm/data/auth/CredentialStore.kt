package lvt.crm.data.auth

data class CredentialSnapshot(
    val accessToken: String,
    val refreshToken: String,
    val revision: Long,
)

interface CredentialStore {
    val accessToken: String?
    val refreshToken: String?

    fun snapshot(): CredentialSnapshot?
    fun invalidatePendingWrites(): Long
    fun saveIfRevision(revision: Long, accessToken: String, refreshToken: String): Boolean
    fun replaceIfCurrent(
        expected: CredentialSnapshot,
        accessToken: String,
        refreshToken: String,
    ): Boolean
    fun clearIfRevision(revision: Long): Boolean
    fun clearIfCurrent(expected: CredentialSnapshot): Boolean
    fun clear()
}
