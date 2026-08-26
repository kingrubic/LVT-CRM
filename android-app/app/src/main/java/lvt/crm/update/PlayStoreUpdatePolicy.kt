package lvt.crm.update

object PlayStoreUpdatePolicy {
    fun shouldStartImmediateUpdate(
        updateAvailable: Boolean,
        immediateAllowed: Boolean,
        developerTriggeredInProgress: Boolean,
    ): Boolean {
        if (developerTriggeredInProgress) return true
        return updateAvailable && immediateAllowed
    }
}
