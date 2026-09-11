package lvt.crm.ui.duties

import android.graphics.Bitmap
import android.graphics.pdf.PdfRenderer
import android.os.ParcelFileDescriptor
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.ChevronLeft
import androidx.compose.material.icons.outlined.ChevronRight
import androidx.compose.material.icons.outlined.Download
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import lvt.crm.data.convex.ConvexException
import lvt.crm.data.duties.DutiesRepository
import lvt.crm.data.duties.SharedSchedulePdf
import lvt.crm.ui.components.LvtScreen

@Composable
fun SharedDutySchedulePickerScreen(
    dutiesRepository: DutiesRepository,
    onBack: () -> Unit,
) {
    var mode by remember { mutableStateOf("week") }
    var anchorIso by remember { mutableStateOf(todayIsoDate()) }
    var loading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var preview by remember { mutableStateOf<SharedSchedulePdf?>(null) }
    val range = scheduleRange(mode, anchorIso)
    val scope = rememberCoroutineScope()

    val currentPreview = preview
    if (currentPreview != null) {
        SharedDutySchedulePreviewScreen(
            pdf = currentPreview,
            onBack = { preview = null },
        )
        return
    }

    BackHandler(onBack = onBack)
    LvtScreen(
        title = "Lịch công tác chung",
        navigationIcon = {
            IconButton(onClick = onBack) {
                Icon(Icons.AutoMirrored.Outlined.ArrowBack, contentDescription = "Quay lại")
            }
        },
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = 16.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterHorizontally),
            ) {
                FilterChip(
                    selected = mode == "week",
                    onClick = { mode = "week" },
                    label = { Text("Tuần") },
                )
                FilterChip(
                    selected = mode == "month",
                    onClick = { mode = "month" },
                    label = { Text("Tháng") },
                )
            }
            Spacer(modifier = Modifier.height(16.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                IconButton(
                    onClick = { anchorIso = shiftScheduleAnchor(mode, anchorIso, -1) },
                    modifier = Modifier.height(48.dp),
                ) {
                    Icon(Icons.Outlined.ChevronLeft, contentDescription = "Kỳ trước")
                }
                Text(
                    range.shortLabel,
                    modifier = Modifier.weight(1f),
                    textAlign = TextAlign.Center,
                    style = MaterialTheme.typography.titleMedium,
                )
                IconButton(
                    onClick = { anchorIso = shiftScheduleAnchor(mode, anchorIso, 1) },
                    modifier = Modifier.height(48.dp),
                ) {
                    Icon(Icons.Outlined.ChevronRight, contentDescription = "Kỳ sau")
                }
            }
            TextButton(
                onClick = { anchorIso = todayIsoDate() },
                modifier = Modifier.align(Alignment.CenterHorizontally),
            ) {
                Text("Hôm nay")
            }
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                "Xem bản PDF giống lịch công tác trên máy tính, rồi tải về nếu cần.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth(),
            )
            error?.let {
                Text(
                    it,
                    color = MaterialTheme.colorScheme.error,
                    style = MaterialTheme.typography.bodyMedium,
                    modifier = Modifier.padding(top = 12.dp),
                    textAlign = TextAlign.Center,
                )
            }
            Spacer(modifier = Modifier.weight(1f))
            Button(
                onClick = {
                    if (loading) return@Button
                    loading = true
                    error = null
                    scope.launch {
                        runCatching { dutiesRepository.downloadSharedSchedulePdf(mode, anchorIso) }
                            .onSuccess { preview = it }
                            .onFailure { failure ->
                                error = (failure as? ConvexException)?.message
                                    ?: "Không tải được lịch công tác chung. Hãy thử lại."
                            }
                        loading = false
                    }
                },
                enabled = !loading,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(bottom = 20.dp)
                    .height(52.dp),
            ) {
                if (loading) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(22.dp),
                        strokeWidth = 2.dp,
                        color = MaterialTheme.colorScheme.onPrimary,
                    )
                } else {
                    Text("Xem lịch")
                }
            }
        }
    }
}

@Composable
fun SharedDutySchedulePreviewScreen(
    pdf: SharedSchedulePdf,
    onBack: () -> Unit,
) {
    BackHandler(onBack = onBack)
    val context = LocalContext.current
    var saveMessage by remember { mutableStateOf<String?>(null) }
    val saveLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.CreateDocument("application/pdf"),
    ) { uri ->
        if (uri == null) return@rememberLauncherForActivityResult
        saveMessage = runCatching {
            context.contentResolver.openOutputStream(uri)?.use { output ->
                pdf.file.inputStream().use { input -> input.copyTo(output) }
            } ?: error("empty")
            "Đã lưu tệp."
        }.getOrElse { "Không thể lưu tệp. Hãy thử lại." }
    }
    val density = LocalDensity.current
    val pages = remember(pdf.file) {
        val width = with(density) { 360.dp.toPx().toInt() }
        renderPdfPages(pdf.file, width)
    }
    LvtScreen(
        title = pdf.fileName,
        navigationIcon = {
            IconButton(onClick = onBack) {
                Icon(Icons.AutoMirrored.Outlined.ArrowBack, contentDescription = "Đóng")
            }
        },
        actions = {
            IconButton(onClick = { saveLauncher.launch(pdf.fileName) }) {
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
            if (pages.isEmpty()) {
                Text(
                    "Không xem trước được PDF. Hãy tải tệp về máy.",
                    modifier = Modifier.padding(16.dp),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            } else {
                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    items(pages) { bitmap ->
                        Image(
                            bitmap = bitmap.asImageBitmap(),
                            contentDescription = null,
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(horizontal = 8.dp),
                            contentScale = ContentScale.FillWidth,
                        )
                    }
                }
            }
        }
    }
}

private fun renderPdfPages(file: java.io.File, maxWidthPx: Int): List<Bitmap> {
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
