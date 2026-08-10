package lvt.crm.ui.duties

import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import lvt.crm.data.duties.DutiesOperations
import lvt.crm.data.duties.DutiesSnapshot
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class DutiesViewModelConcurrencyTest {
    private val dispatcher = StandardTestDispatcher()

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    @Test
    fun `attendance action waits for busy refresh and runs exactly once`() = runTest(dispatcher) {
        val repository = BlockingDutiesOperations()
        val viewModel = DutiesViewModel(repository)
        runCurrent()
        assertTrue(repository.refreshStarted.isCompleted)

        viewModel.setAttendance("duty-1", "present")

        assertEquals("duty-1", viewModel.uiState.value.busyDutyId)
        assertEquals(0, repository.attendanceCalls)

        repository.releaseRefresh.complete(Unit)
        advanceUntilIdle()

        assertEquals(1, repository.attendanceCalls)
        assertEquals(null, viewModel.uiState.value.busyDutyId)
    }
}

private class BlockingDutiesOperations : DutiesOperations {
    val refreshStarted = CompletableDeferred<Unit>()
    val releaseRefresh = CompletableDeferred<Unit>()
    var listCalls = 0
    var attendanceCalls = 0

    override suspend fun listMine(): DutiesSnapshot {
        if (listCalls++ == 0) {
            refreshStarted.complete(Unit)
            releaseRefresh.await()
        }
        return DutiesSnapshot(attendanceConfirmationEnabled = true, duties = emptyList())
    }

    override suspend fun setAttendance(dutyId: String, status: String) {
        attendanceCalls++
    }
}
