package lvt.crm.ui.work

import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import lvt.crm.data.work.WorkApprovalItem
import lvt.crm.data.work.WorkCompletionReviewItem
import lvt.crm.data.work.WorkOperations
import lvt.crm.data.work.WorkSnapshot
import lvt.crm.data.work.WorkTaskItem
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class WorkViewModelConcurrencyTest {
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
    fun `approval waits for busy refresh and runs exactly once`() = runTest(dispatcher) {
        val repository = BlockingWorkOperations()
        val viewModel = WorkViewModel(repository)
        runCurrent()
        assertTrue(repository.refreshStarted.isCompleted)
        val approval = approval("approval-1")

        viewModel.decideApproval(approval, approve = true)

        assertEquals("approval-1", viewModel.uiState.value.busyApprovalId)
        assertEquals(0, repository.approvalCalls)

        repository.releaseRefresh.complete(Unit)
        advanceUntilIdle()

        assertEquals(1, repository.approvalCalls)
        assertEquals(null, viewModel.uiState.value.busyApprovalId)
    }

    @Test
    fun `quality completion is accepted while refresh is busy`() = runTest(dispatcher) {
        val repository = BlockingWorkOperations()
        val viewModel = WorkViewModel(repository)
        runCurrent()
        val task = task("task-1")

        viewModel.requestComplete(task)
        viewModel.onQualityInput("85")
        viewModel.confirmQualityComplete()

        assertEquals(null, viewModel.uiState.value.qualityPromptTask)
        assertEquals("task-1", viewModel.uiState.value.busyTaskId)
        assertEquals(0, repository.completionCalls)

        repository.releaseRefresh.complete(Unit)
        advanceUntilIdle()

        assertEquals(1, repository.completionCalls)
        assertEquals(85, repository.lastQualityPercent)
    }

    @Test
    fun `completeWithEvidence uploads evidence and completes task`() = runTest(dispatcher) {
        val repository = BlockingWorkOperations()
        val viewModel = WorkViewModel(repository)
        repository.releaseRefresh.complete(Unit)
        advanceUntilIdle()

        val task = task("task-2").copy(isAdmin = false)
        viewModel.requestComplete(task)
        assertEquals(task, viewModel.uiState.value.evidencePromptTask)
        viewModel.onEvidenceNoteChange("  Đã nộp báo cáo  ")

        viewModel.completeWithEvidence(task, "hello".toByteArray(), "proof.pdf", "application/pdf")
        advanceUntilIdle()

        assertEquals(1, repository.completionCalls)
        assertEquals(1, repository.uploadCalls)
        assertEquals("proof.pdf", repository.lastUploadedEvidence?.fileName)
        assertEquals("Đã nộp báo cáo", repository.lastNote)
        assertEquals(null, viewModel.uiState.value.evidencePromptTask)
    }

    private fun approval(id: String) = WorkApprovalItem(
        id = id,
        fileName = "file.pdf",
        content = "content",
        deadline = "2026-08-10",
        status = "pending",
        approvalCount = 0,
        approvalTotal = 1,
        myDecision = "",
    )

    private fun task(id: String) = WorkTaskItem(
        id = id,
        kind = WorkTaskItem.Kind.WorkItem,
        title = "Task",
        deadline = "2026-08-10",
        status = "in_progress",
        documentContent = "Document",
        departmentName = "Office",
        qualityPercent = null,
        rejectionReason = "",
        isAdmin = true,
    )
}

private class BlockingWorkOperations : WorkOperations {
    val refreshStarted = CompletableDeferred<Unit>()
    val releaseRefresh = CompletableDeferred<Unit>()
    var listCalls = 0
    var approvalCalls = 0
    var completionCalls = 0
    var uploadCalls = 0
    var lastQualityPercent: Int? = null
    var lastUploadedEvidence: lvt.crm.data.work.WorkUploadedEvidence? = null
    var lastNote: String? = null

    override suspend fun listMine(): WorkSnapshot {
        if (listCalls++ == 0) {
            refreshStarted.complete(Unit)
            releaseRefresh.await()
        }
        return WorkSnapshot(
            assignerMode = "",
            isAdmin = true,
            accessLevel = 3,
            tasks = emptyList(),
            approvals = emptyList(),
        )
    }

    override suspend fun uploadEvidence(fileBytes: ByteArray, fileName: String, mimeType: String): lvt.crm.data.work.WorkUploadedEvidence {
        uploadCalls++
        val evidence = lvt.crm.data.work.WorkUploadedEvidence(
            driveFileId = "drive-1",
            driveChecksum = "chk-1",
            cleanupToken = "tok-1",
            fileName = fileName,
            fileType = mimeType,
            fileSize = fileBytes.size.toLong(),
        )
        lastUploadedEvidence = evidence
        return evidence
    }

    override suspend fun complete(item: WorkTaskItem, qualityPercent: Int?, evidence: lvt.crm.data.work.WorkUploadedEvidence?, note: String?) {
        completionCalls++
        lastQualityPercent = qualityPercent
        lastUploadedEvidence = evidence
        lastNote = note
    }

    override suspend fun decideApproval(documentId: String, approve: Boolean) {
        approvalCalls++
    }

    override suspend fun reviewCompletion(
        review: WorkCompletionReviewItem,
        approve: Boolean,
        qualityPercent: Int?,
        rejectionReason: String?,
    ) = Unit
}
