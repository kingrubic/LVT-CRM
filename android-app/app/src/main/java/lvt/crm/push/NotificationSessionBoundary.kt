package lvt.crm.push

import lvt.crm.data.auth.CredentialSnapshot

/** Serializes notification side effects with logout cleanup for the active credential revision. */
internal object NotificationSessionBoundary {
    private val sideEffectLock = Any()

    fun runIfCurrent(
        expected: CredentialSnapshot,
        current: () -> CredentialSnapshot?,
        sideEffect: () -> Boolean,
    ): Boolean? = synchronized(sideEffectLock) {
        if (current() != expected) return@synchronized null
        sideEffect()
    }

    fun cleanup(sideEffect: () -> Unit) = synchronized(sideEffectLock) {
        sideEffect()
    }
}
