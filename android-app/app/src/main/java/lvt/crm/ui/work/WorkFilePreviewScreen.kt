package lvt.crm.ui.work

import android.graphics.Bitmap
import android.graphics.pdf.PdfRenderer
import android.os.ParcelFileDescriptor
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.Download
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.dp
import lvt.crm.data.work.WorkApprovalItem
import lvt.crm.ui.components.LvtScreen
import java.io.File

data class WorkFilePreviewState(
    val document: WorkApprovalItem,
    val file: File,
)

@Composable
fun WorkFilePreviewScreen(
    preview: WorkFilePreviewState,
    onBack: () -> Unit,
    onOpenExternally: () -> Unit,
) {
    BackHandler(onBack = onBack)
    val context = LocalContext.current
    val fileName = preview.document.fileName.ifBlank { preview.file.name }
    val mime = WorkFileOpener.mimeType(fileName)
    var saveMessage by remember { mutableStateOf<String?>(null) }
    val saveLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.CreateDocument(mime),
    ) { uri ->
        if (uri == null) return@rememberLauncherForActivityResult
        saveMessage = runCatching {
            context.contentResolver.openOutputStream(uri)?.use { output ->
                preview.file.inputStream().use { input -> input.copyTo(output) }
            } ?: error("empty")
            "Đã lưu tệp."
        }.getOrElse { "Không thể lưu tệp. Hãy thử lại." }
    }
    LvtScreen(
        title = fileName,
        navigationIcon = {
            IconButton(onClick = onBack) {
                Icon(Icons.AutoMirrored.Outlined.ArrowBack, contentDescription = "Đóng")
            }
        },
        actions = {
            IconButton(onClick = { saveLauncher.launch(fileName) }) {
                Icon(Icons.Outlined.Download, contentDescription = "Tải xuống")
            }
        },
    ) {
        Column(modifier = Modifier.fillMaxSize()) {
            saveMessage?.let {
                Text(
                    it,
                    color = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
                )
            }
            when (previewKind(fileName)) {
                PreviewKind.Pdf -> PdfPreview(preview.file, modifier = Modifier.weight(1f))
                PreviewKind.Image -> ImagePreview(preview.file, fileName, modifier = Modifier.weight(1f))
                PreviewKind.Unsupported -> UnsupportedPreview(
                    fileName = fileName,
                    onDownload = { saveLauncher.launch(fileName) },
                    onOpenExternally = onOpenExternally,
                    modifier = Modifier.weight(1f),
                )
            }
        }
    }
}

private enum class PreviewKind { Pdf, Image, Unsupported }

private fun previewKind(fileName: String): PreviewKind = when (
    fileName.substringAfterLast('.', "").lowercase()
) {
    "pdf" -> PreviewKind.Pdf
    "png", "jpg", "jpeg" -> PreviewKind.Image
    else -> PreviewKind.Unsupported
}

@Composable
private fun ImagePreview(file: File, fileName: String, modifier: Modifier = Modifier) {
    val bitmap = remember(file.absolutePath, file.length()) {
        android.graphics.BitmapFactory.decodeFile(file.absolutePath)
    }
    if (bitmap == null) {
        Text(
            "Không thể xem trước $fileName.",
            modifier = modifier.padding(20.dp),
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        return
    }
    LazyColumn(modifier = modifier.fillMaxSize()) {
        item {
            Image(
                bitmap = bitmap.asImageBitmap(),
                contentDescription = fileName,
                contentScale = ContentScale.FillWidth,
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }
}

@Composable
private fun PdfPreview(file: File, modifier: Modifier = Modifier) {
    val widthPx = with(LocalDensity.current) { 720.dp.roundToPx() }
    val pages = remember(file.absolutePath, file.length(), widthPx) {
        renderPdfPages(file, widthPx)
    }
    if (pages.isEmpty()) {
        Text(
            "Không thể xem trước tệp PDF.",
            modifier = modifier.padding(20.dp),
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        return
    }
    LazyColumn(
        modifier = modifier.fillMaxSize(),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        items(pages) { page ->
            Image(
                bitmap = page.asImageBitmap(),
                contentDescription = null,
                contentScale = ContentScale.FillWidth,
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }
}

@Composable
private fun UnsupportedPreview(
    fileName: String,
    onDownload: () -> Unit,
    onOpenExternally: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(24.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(
            "Không xem trước được $fileName trên ứng dụng.",
            style = MaterialTheme.typography.bodyLarge,
        )
        Spacer(modifier = Modifier.height(16.dp))
        Button(onClick = onDownload, modifier = Modifier.fillMaxWidth()) {
            Text("Tải xuống")
        }
        OutlinedButton(onClick = onOpenExternally, modifier = Modifier.fillMaxWidth()) {
            Text("Mở bằng ứng dụng khác")
        }
    }
}

private fun renderPdfPages(file: File, maxWidthPx: Int): List<Bitmap> {
    val descriptor = runCatching {
        ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY)
    }.getOrNull() ?: return emptyList()
    return descriptor.use { pfd ->
        runCatching {
            PdfRenderer(pfd).use { renderer ->
                (0 until renderer.pageCount).map { index ->
                    renderer.openPage(index).use { page ->
                        val width = maxWidthPx.coerceAtLeast(1)
                        val height = ((page.height.toFloat() / page.width) * width).toInt().coerceAtLeast(1)
                        Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888).also { bitmap ->
                            bitmap.eraseColor(android.graphics.Color.WHITE)
                            page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
                        }
                    }
                }
            }
        }.getOrDefault(emptyList())
    }
}
