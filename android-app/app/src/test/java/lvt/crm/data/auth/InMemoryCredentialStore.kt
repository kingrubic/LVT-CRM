package lvt.crm.data.auth

internal class InMemoryCredentialStore(
    accessToken: String? = null,
    refreshToken: String? = null,
) : CredentialStore {
    private val lock = Any()
    private var revision = 0L
    private var access = accessToken
    private var refresh = refreshToken

    override val accessToken: String?
        get() = synchronized(lock) { access }

    override val refreshToken: String?
        get() = synchronized(lock) { refresh }

    override fun snapshot(): CredentialSnapshot? = synchronized(lock) {
        snapshotLocked()
    }

    override fun invalidatePendingWrites(): Long = synchronized(lock) { ++revision }

    override fun saveIfRevision(
        revision: Long,
        accessToken: String,
        refreshToken: String,
    ): Boolean = synchronized(lock) {
        if (this.revision != revision) return@synchronized false
        access = accessToken
        refresh = refreshToken
        true
    }

    override fun replaceIfCurrent(
        expected: CredentialSnapshot,
        accessToken: String,
        refreshToken: String,
    ): Boolean = synchronized(lock) {
        if (snapshotLocked() != expected) return@synchronized false
        access = accessToken
        refresh = refreshToken
        true
    }

    override fun clearIfRevision(revision: Long): Boolean = synchronized(lock) {
        if (this.revision != revision) return@synchronized false
        clearLocked()
        true
    }

    override fun clearIfCurrent(expected: CredentialSnapshot): Boolean = synchronized(lock) {
        if (snapshotLocked() != expected) return@synchronized false
        clearLocked()
        true
    }

    override fun clear() = synchronized(lock) { clearLocked() }

    private fun snapshotLocked(): CredentialSnapshot? {
        val currentAccess = access?.takeIf { it.isNotBlank() } ?: return null
        val currentRefresh = refresh?.takeIf { it.isNotBlank() } ?: return null
        return CredentialSnapshot(currentAccess, currentRefresh, revision)
    }

    private fun clearLocked() {
        ++revision
        access = null
        refresh = null
    }
}
