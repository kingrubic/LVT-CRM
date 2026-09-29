package lvt.crm.ui.chat

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material3.Button
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.OffsetMapping
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.text.input.TransformedText
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import lvt.crm.data.chat.CHAT_BOLD
import lvt.crm.data.chat.CHAT_ITALIC
import lvt.crm.data.chat.CHAT_RECALL_WINDOW_MS
import lvt.crm.data.chat.CHAT_RECALLED_PLACEHOLDER
import lvt.crm.data.chat.CHAT_TEXT_MAX_LENGTH
import lvt.crm.data.chat.CHAT_UNDERLINE
import lvt.crm.data.chat.ChatAction
import lvt.crm.data.chat.ChatMessage
import lvt.crm.data.chat.ChatRepository
import lvt.crm.data.chat.ChatRun
import lvt.crm.data.chat.ChatTarget
import lvt.crm.data.chat.chatApplyEdit
import lvt.crm.data.chat.chatContextText
import lvt.crm.data.chat.chatFailureMessage
import lvt.crm.data.chat.chatHtmlToRuns
import lvt.crm.data.chat.chatRecallStillOpen
import lvt.crm.data.chat.chatTextToHtml
import lvt.crm.data.chat.chatToggleFlag
import lvt.crm.data.chat.formatChatTime
import lvt.crm.data.convex.ConvexException
import lvt.crm.ui.components.LvtScreen

private const val POLL_MS = 8_000L

@Composable
fun ChatDialog(
    repository: ChatRepository,
    target: ChatTarget,
    onBack: () -> Unit,
) {
    Dialog(
        onDismissRequest = onBack,
        properties = DialogProperties(
            usePlatformDefaultWidth = false,
            dismissOnClickOutside = false,
        ),
    ) {
        Surface(modifier = Modifier.fillMaxSize()) {
            ChatScreen(repository = repository, target = target, onBack = onBack)
        }
    }
}

@Composable
fun ChatScreen(
    repository: ChatRepository,
    target: ChatTarget,
    onBack: () -> Unit,
    canSend: Boolean = true,
    actionLabel: String? = null,
    onAction: (() -> Unit)? = null,
    markReadKey: String? = null,
    onArchive: (() -> Unit)? = null,
) {
    val scope = rememberCoroutineScope()
    var title by remember(target.entityId) { mutableStateOf(target.title.ifBlank { "Trao đổi" }) }
    var messages by remember(target.entityId) { mutableStateOf<List<ChatMessage>>(emptyList()) }
    var loading by remember(target.entityId) { mutableStateOf(true) }
    var sending by remember { mutableStateOf(false) }
    var recallingId by remember { mutableStateOf<String?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var now by remember { mutableLongStateOf(System.currentTimeMillis()) }
    var draft by remember(target.entityId) { mutableStateOf(TextFieldValue("")) }
    var flags by remember(target.entityId) { mutableStateOf(IntArray(0)) }
    var insertFlags by remember(target.entityId) { mutableIntStateOf(0) }
    val listState = rememberLazyListState()

    suspend fun reload() {
        runCatching { repository.list(target) }
            .onSuccess { thread ->
                if (thread.title.isNotBlank()) title = thread.title
                messages = thread.messages
                error = null
                loading = false
                if (!markReadKey.isNullOrBlank()) {
                    runCatching { repository.markRead(markReadKey) }
                }
            }
            .onFailure { failure ->
                loading = false
                if (messages.isEmpty()) error = failure.chatMessage(ChatAction.Load)
            }
    }

    LaunchedEffect(target.entityId, target.kind) {
        while (true) {
            reload()
            delay(POLL_MS)
        }
    }
    LaunchedEffect(messages.size) {
        if (messages.isNotEmpty()) listState.scrollToItem(messages.lastIndex)
    }
    LaunchedEffect(messages) {
        val deadline = messages
            .filter { it.isSelf && !it.recalled && it.canRecall }
            .minOfOrNull { it.createdAt + CHAT_RECALL_WINDOW_MS }
            ?: return@LaunchedEffect
        val wait = deadline - System.currentTimeMillis()
        if (wait > 0L) delay(wait)
        now = System.currentTimeMillis()
    }

    LvtScreen(
        title = "Trao đổi",
        showAccountHeader = true,
        navigationIcon = {
            IconButton(onClick = onBack) {
                Icon(Icons.AutoMirrored.Outlined.ArrowBack, contentDescription = "Đóng")
            }
        },
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = 16.dp),
        ) {
            Text(title, style = MaterialTheme.typography.titleLarge)
            Text(
                chatContextText(target.kind),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = 4.dp, bottom = 4.dp),
            )
            if (!actionLabel.isNullOrBlank() && onAction != null) {
                TextButton(onClick = onAction, modifier = Modifier.padding(bottom = 4.dp)) {
                    Text(actionLabel)
                }
            }
            Box(modifier = Modifier.weight(1f)) {
                when {
                    loading && messages.isEmpty() -> Text("Đang tải tin nhắn…")
                    messages.isEmpty() && error == null -> Text("Chưa có tin nhắn. Hãy bắt đầu trao đổi.")
                    messages.isNotEmpty() -> LazyColumn(
                        state = listState,
                        modifier = Modifier.fillMaxSize(),
                        verticalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        items(messages, key = { it.id }) { message ->
                            ChatBubble(
                                message = message,
                                recallVisible = message.isSelf &&
                                    message.canRecall &&
                                    chatRecallStillOpen(message.createdAt, message.recalled, now),
                                recalling = recallingId == message.id,
                                onRecall = {
                                    if (recallingId != null) return@ChatBubble
                                    recallingId = message.id
                                    error = null
                                    scope.launch {
                                        runCatching { repository.recall(target, message.id) }
                                            .onSuccess { reload() }
                                            .onFailure { failure ->
                                                error = failure.chatMessage(ChatAction.Recall)
                                            }
                                        recallingId = null
                                    }
                                },
                            )
                        }
                    }
                }
            }
            error?.let {
                Text(
                    it,
                    color = MaterialTheme.colorScheme.error,
                    style = MaterialTheme.typography.bodySmall,
                    modifier = Modifier.padding(vertical = 6.dp),
                )
            }
            if (onArchive != null && error != null && messages.isEmpty() && !loading) {
                TextButton(onClick = onArchive) { Text("Ẩn cuộc trò chuyện") }
            }
            if (canSend) {
            ChatComposer(
                value = draft,
                flags = flags,
                insertFlags = insertFlags,
                sending = sending || (loading && messages.isEmpty()),
                onValueChange = { next ->
                    if (next.text == draft.text) {
                        draft = next
                        if (next.selection.collapsed) {
                            val index = (next.selection.start - 1).coerceAtLeast(0)
                            insertFlags = flags.getOrElse(index) { insertFlags }
                        }
                    } else {
                        flags = chatApplyEdit(draft.text, flags, next.text, insertFlags)
                        draft = next
                    }
                },
                onToggle = { bit ->
                    val selection = draft.selection
                    if (selection.collapsed) {
                        insertFlags = insertFlags xor bit
                    } else {
                        val start = minOf(selection.start, selection.end)
                        val end = maxOf(selection.start, selection.end)
                        flags = chatToggleFlag(flags, start, end, bit)
                    }
                },
                onSend = {
                    val plain = draft.text.replace('\u00a0', ' ').trim()
                    if (plain.isEmpty() || sending) return@ChatComposer
                    if (plain.length > CHAT_TEXT_MAX_LENGTH) {
                        error = chatFailureMessage("CHAT_TOO_LONG", ChatAction.Send)
                        return@ChatComposer
                    }
                    val html = chatTextToHtml(draft.text, flags)
                    sending = true
                    error = null
                    scope.launch {
                        runCatching { repository.send(target, html) }
                            .onSuccess {
                                draft = TextFieldValue("")
                                flags = IntArray(0)
                                insertFlags = 0
                                reload()
                            }
                            .onFailure { failure -> error = failure.chatMessage(ChatAction.Send) }
                        sending = false
                    }
                },
            )
            } else {
                Text(
                    "Bạn đang xem nhóm này. Chỉ thành viên mới gửi tin.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(bottom = 16.dp),
                )
            }
        }
    }
}

@Composable
private fun ChatBubble(
    message: ChatMessage,
    recallVisible: Boolean,
    recalling: Boolean,
    onRecall: () -> Unit,
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = if (message.isSelf) Arrangement.End else Arrangement.Start,
    ) {
        if (!message.isSelf) Initials(message.authorInitials)
        Column(
            modifier = Modifier
                .padding(horizontal = 8.dp)
                .weight(1f, fill = false),
            horizontalAlignment = if (message.isSelf) Alignment.End else Alignment.Start,
        ) {
            Text(message.authorName, style = MaterialTheme.typography.labelLarge)
            Text(
                formatChatTime(message.createdAt),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            if (message.recalled) {
                Text(
                    CHAT_RECALLED_PLACEHOLDER,
                    fontStyle = FontStyle.Italic,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            } else {
                Text(annotated(chatHtmlToRuns(message.bodyHtml)))
            }
            if (recallVisible) {
                TextButton(onClick = onRecall, enabled = !recalling) {
                    Text(if (recalling) "Đang thu hồi…" else "Thu hồi")
                }
            }
        }
        if (message.isSelf) Initials(message.authorInitials)
    }
}

@Composable
private fun Initials(value: String) {
    Box(
        modifier = Modifier
            .size(36.dp)
            .clip(CircleShape)
            .background(MaterialTheme.colorScheme.primaryContainer),
        contentAlignment = Alignment.Center,
    ) {
        Text(value, style = MaterialTheme.typography.labelMedium)
    }
}

@Composable
private fun ChatComposer(
    value: TextFieldValue,
    flags: IntArray,
    insertFlags: Int,
    sending: Boolean,
    onValueChange: (TextFieldValue) -> Unit,
    onToggle: (Int) -> Unit,
    onSend: () -> Unit,
) {
    val empty = value.text.replace('\u00a0', ' ').isBlank()
    Column(modifier = Modifier.padding(bottom = 12.dp)) {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            StyleChip("In đậm", "B", CHAT_BOLD, value, flags, insertFlags, sending, onToggle)
            StyleChip("In nghiêng", "I", CHAT_ITALIC, value, flags, insertFlags, sending, onToggle)
            StyleChip("Gạch chân", "U", CHAT_UNDERLINE, value, flags, insertFlags, sending, onToggle)
        }
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = 8.dp)
                .heightIn(min = 72.dp)
                .clip(MaterialTheme.shapes.medium)
                .background(MaterialTheme.colorScheme.surfaceVariant)
                .padding(12.dp),
        ) {
            if (empty) {
                Text("Nhập tin nhắn…", color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            BasicTextField(
                value = value,
                onValueChange = onValueChange,
                enabled = !sending,
                textStyle = MaterialTheme.typography.bodyLarge.copy(color = MaterialTheme.colorScheme.onSurface),
                cursorBrush = SolidColor(MaterialTheme.colorScheme.primary),
                modifier = Modifier
                    .fillMaxWidth()
                    .semantics { contentDescription = "Nội dung tin nhắn" },
                visualTransformation = VisualTransformation { text ->
                    val styled = buildAnnotatedString {
                        text.text.forEachIndexed { index, char ->
                            withStyle(spanFor(flags.getOrElse(index) { 0 })) { append(char) }
                        }
                    }
                    TransformedText(styled, OffsetMapping.Identity)
                },
            )
        }
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
            Button(onClick = onSend, enabled = !sending && !empty) {
                Text(if (sending) "Đang gửi…" else "Gửi")
            }
        }
    }
}

@Composable
private fun StyleChip(
    label: String,
    hint: String,
    bit: Int,
    value: TextFieldValue,
    flags: IntArray,
    insertFlags: Int,
    sending: Boolean,
    onToggle: (Int) -> Unit,
) {
    val selection = value.selection
    val selected = if (selection.collapsed) {
        insertFlags and bit != 0
    } else {
        val start = minOf(selection.start, selection.end)
        val end = maxOf(selection.start, selection.end)
        start < end && (start until end).all { flags.getOrElse(it) { 0 } and bit != 0 }
    }
    FilterChip(
        selected = selected,
        onClick = { onToggle(bit) },
        enabled = !sending,
        label = { Text(hint) },
        modifier = Modifier.semantics { contentDescription = label },
    )
}

private fun spanFor(flag: Int): SpanStyle = SpanStyle(
    fontWeight = if (flag and CHAT_BOLD != 0) FontWeight.Bold else null,
    fontStyle = if (flag and CHAT_ITALIC != 0) FontStyle.Italic else null,
    textDecoration = if (flag and CHAT_UNDERLINE != 0) TextDecoration.Underline else null,
)

private fun annotated(runs: List<ChatRun>) = buildAnnotatedString {
    runs.forEach { run ->
        val flag = (if (run.bold) CHAT_BOLD else 0) or
            (if (run.italic) CHAT_ITALIC else 0) or
            (if (run.underline) CHAT_UNDERLINE else 0)
        withStyle(spanFor(flag)) { append(run.text) }
    }
}

private fun Throwable.chatMessage(action: ChatAction): String {
    val raw = when (this) {
        is ConvexException -> "$code $message"
        else -> message.orEmpty()
    }
    return chatFailureMessage(raw, action)
}
