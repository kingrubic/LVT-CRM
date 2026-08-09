package lvt.crm.data.auth

import android.content.Context
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

class TokenStore(context: Context) : CredentialStore {
    private val credentialLock = Any()
    private var revision = 0L
    private val prefs = EncryptedSharedPreferences.create(
        context,
        "lvt_crm_auth",
        MasterKey.Builder(context).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build(),
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
    )

    override val accessToken: String?
        get() = synchronized(credentialLock) { prefs.getString(KEY_ACCESS, null) }

    override val refreshToken: String?
        get() = synchronized(credentialLock) { prefs.getString(KEY_REFRESH, null) }

    override fun snapshot(): CredentialSnapshot? = synchronized(credentialLock) {
        val access = prefs.getString(KEY_ACCESS, null)?.takeIf { it.isNotBlank() } ?: return@synchronized null
        val refresh = prefs.getString(KEY_REFRESH, null)?.takeIf { it.isNotBlank() } ?: return@synchronized null
        CredentialSnapshot(access, refresh, revision)
    }

    override fun invalidatePendingWrites(): Long = synchronized(credentialLock) {
        ++revision
    }

    override fun saveIfRevision(
        revision: Long,
        accessToken: String,
        refreshToken: String,
    ): Boolean = synchronized(credentialLock) {
        if (this.revision != revision) return@synchronized false
        persist(accessToken, refreshToken)
        true
    }

    override fun replaceIfCurrent(
        expected: CredentialSnapshot,
        accessToken: String,
        refreshToken: String,
    ): Boolean = synchronized(credentialLock) {
        if (currentSnapshot() != expected) return@synchronized false
        persist(accessToken, refreshToken)
        true
    }

    override fun clearIfRevision(revision: Long): Boolean = synchronized(credentialLock) {
        if (this.revision != revision) return@synchronized false
        clearLocked()
        true
    }

    override fun clearIfCurrent(expected: CredentialSnapshot): Boolean = synchronized(credentialLock) {
        if (currentSnapshot() != expected) return@synchronized false
        clearLocked()
        true
    }

    override fun clear() = synchronized(credentialLock) {
        clearLocked()
    }

    private fun currentSnapshot(): CredentialSnapshot? {
        val access = prefs.getString(KEY_ACCESS, null)?.takeIf { it.isNotBlank() } ?: return null
        val refresh = prefs.getString(KEY_REFRESH, null)?.takeIf { it.isNotBlank() } ?: return null
        return CredentialSnapshot(access, refresh, revision)
    }

    private fun persist(accessToken: String, refreshToken: String) {
        val committed = prefs.edit()
            .putString(KEY_ACCESS, accessToken)
            .putString(KEY_REFRESH, refreshToken)
            .commit()
        check(committed) { "TOKEN_PERSIST_FAILED" }
    }

    private fun clearLocked() {
        ++revision
        check(prefs.edit().clear().commit()) { "TOKEN_CLEAR_FAILED" }
    }

    companion object {
        private const val KEY_ACCESS = "access_token"
        private const val KEY_REFRESH = "refresh_token"
    }
}
