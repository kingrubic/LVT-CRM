package lvt.crm.ui.work

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.webkit.MimeTypeMap
import androidx.core.content.FileProvider
import lvt.crm.data.convex.ConvexException
import lvt.crm.data.work.WorkApprovalItem
import lvt.crm.data.work.WorkRepository

class WorkFileOpener(
    private val context: Context,
    private val repository: WorkRepository,
) {
    suspend fun open(document: WorkApprovalItem) {
        val file = repository.downloadDocument(document)
        val uri = FileProvider.getUriForFile(
            context,
            "${context.packageName}.files",
            file,
        )
        val intent = Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(uri, mimeType(document.fileName.ifBlank { file.name }))
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        try {
            context.startActivity(Intent.createChooser(intent, "Mở công văn"))
        } catch (_: ActivityNotFoundException) {
            throw ConvexException("WORK_FILE_NO_APP", "Không có ứng dụng nào mở được tệp này.")
        }
    }

    companion object {
        fun mimeType(fileName: String): String {
            val ext = fileName.substringAfterLast('.', "").lowercase()
            return MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext)
                ?: when (ext) {
                    "pdf" -> "application/pdf"
                    "doc" -> "application/msword"
                    "docx" -> "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    "xls" -> "application/vnd.ms-excel"
                    "xlsx" -> "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    "ppt" -> "application/vnd.ms-powerpoint"
                    "pptx" -> "application/vnd.openxmlformats-officedocument.presentationml.presentation"
                    "png" -> "image/png"
                    "jpg", "jpeg" -> "image/jpeg"
                    else -> "application/octet-stream"
                }
        }
    }
}
