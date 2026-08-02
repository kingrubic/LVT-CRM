package lvt.crm.push

import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.asSharedFlow

object PushEvents {
    private val _received = MutableSharedFlow<Unit>(extraBufferCapacity = 1)
    val received = _received.asSharedFlow()

    fun notifyReceived() {
        _received.tryEmit(Unit)
    }
}
