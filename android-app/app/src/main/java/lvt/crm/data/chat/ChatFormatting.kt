package lvt.crm.data.chat

import lvt.crm.data.work.WorkApprovalItem
import lvt.crm.data.work.WorkTaskItem
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

const val CHAT_RECALL_WINDOW_MS = 15 * 60 * 1000L
const val CHAT_RECALLED_PLACEHOLDER = "Tin nhắn đã được thu hồi"
const val CHAT_TEXT_MAX_LENGTH = 4000

const val CHAT_BOLD = 1
const val CHAT_ITALIC = 2
const val CHAT_UNDERLINE = 4

enum class ChatKind { Duty, Work, Group }

const val CHAT_GROUP_CREATED_PREVIEW = "Nhóm vừa được tạo"

enum class ChatAction { Load, Send, Recall }

data class ChatTarget(
    val kind: ChatKind,
    val entityId: String,
    val title: String,
)

data class ChatMessage(
    val id: String,
    val authorName: String,
    val authorInitials: String,
    val bodyHtml: String,
    val createdAt: Long,
    val recalled: Boolean,
    val canRecall: Boolean,
    val isSelf: Boolean,
)

data class ChatThread(
    val title: String,
    val messages: List<ChatMessage>,
)

data class ChatConversation(
    val threadKey: String,
    val kind: ChatKind,
    val entityId: String,
    val title: String,
    val lastBodyText: String,
    val lastMessageAt: Long,
    val lastAuthorUserId: String,
    val unreadCount: Int,
    val memberCount: Int = 0,
    val viewerIsMember: Boolean = true,
)

data class ChatInboxSnapshot(
    val currentUserId: String,
    val isAdmin: Boolean,
    val backfillPending: Boolean,
    val conversations: List<ChatConversation>,
)

data class ChatPerson(
    val userId: String,
    val name: String,
    val email: String,
    val departmentName: String,
)

data class ChatGroupMember(
    val userId: String,
    val name: String,
    val role: String,
    val isSelf: Boolean,
)

data class ChatGroupState(
    val groupId: String,
    val name: String,
    val memberCount: Int,
    val canManage: Boolean,
    val canDissolve: Boolean,
    val canLeave: Boolean,
    val canSend: Boolean,
    val members: List<ChatGroupMember>,
)

data class ChatRun(
    val text: String,
    val bold: Boolean = false,
    val italic: Boolean = false,
    val underline: Boolean = false,
)

fun chatContextText(kind: ChatKind): String = when (kind) {
    ChatKind.Duty -> "Tin nhắn hiển thị cho người đã thấy công tác này."
    ChatKind.Work -> "Tin nhắn hiển thị cho người đã thấy công việc này."
    ChatKind.Group -> "Tin nhắn hiển thị cho thành viên nhóm."
}

fun chatKindLabel(kind: ChatKind): String = when (kind) {
    ChatKind.Duty -> "Công tác"
    ChatKind.Work -> "Công việc"
    ChatKind.Group -> "Nhóm"
}

fun chatKindWire(kind: ChatKind): String = when (kind) {
    ChatKind.Duty -> "duty"
    ChatKind.Work -> "work"
    ChatKind.Group -> "group"
}

fun chatKindFromWire(value: String): ChatKind? = when (value) {
    "duty" -> ChatKind.Duty
    "work" -> ChatKind.Work
    "group" -> ChatKind.Group
    else -> null
}

fun chatThreadKey(kind: ChatKind, entityId: String): String = "${chatKindWire(kind)}:$entityId"

fun chatListPreview(lastBodyText: String, lastAuthorUserId: String, currentUserId: String): String {
    val text = lastBodyText.trim()
    if (text.isEmpty()) return "Chưa có tin nhắn"
    if (text == CHAT_RECALLED_PLACEHOLDER || text == CHAT_GROUP_CREATED_PREVIEW) return text
    if (lastAuthorUserId.isNotBlank() && lastAuthorUserId == currentUserId) return "Bạn: $text"
    return text
}

fun chatSearchMatch(haystack: String, query: String): Boolean {
    val needle = normalizeChatSearch(query)
    if (needle.isEmpty()) return true
    val hay = normalizeChatSearch(haystack)
    return needle.split(' ').all { token -> token.isNotEmpty() && hay.contains(token) }
}

fun chatHubFailureMessage(raw: String): String {
    val code = raw.uppercase()
    return when {
        code.contains("GROUP_NAME_REQUIRED") -> "Vui lòng nhập tên nhóm."
        code.contains("GROUP_NAME_TOO_LONG") -> "Tên nhóm tối đa 80 ký tự."
        code.contains("GROUP_MEMBERS_REQUIRED") -> "Hãy chọn ít nhất một thành viên."
        code.contains("GROUP_TOO_MANY_MEMBERS") -> "Nhóm tối đa 100 thành viên."
        code.contains("GROUP_MEMBER_INVALID") -> "Có thành viên không còn hoạt động."
        code.contains("GROUP_NOT_FOUND") -> "Nhóm không còn tồn tại."
        code.contains("GROUP_FORBIDDEN") ||
            code.contains("GROUP_CHAT_FORBIDDEN") ||
            code.contains("WORK_CHAT_FORBIDDEN") ||
            code.contains("DUTY_CHAT_FORBIDDEN") -> "Bạn không có quyền với cuộc trò chuyện này."
        code.contains("CHAT_EMPTY") -> "Vui lòng nhập nội dung tin nhắn."
        code.contains("TOO_LONG") -> "Tin nhắn quá dài (tối đa 4000 ký tự)."
        code.contains("RECALL_TOO_LATE") -> "Đã quá 15 phút, không thể thu hồi tin nhắn này."
        code.contains("RECALL_FORBIDDEN") -> "Bạn chỉ có thể thu hồi tin nhắn của mình."
        else -> "Không thực hiện được. Vui lòng thử lại."
    }
}

private val chatZone: ZoneId = ZoneId.of("Asia/Ho_Chi_Minh")

private data class ChatDateParts(val year: Int, val month: Int, val day: Int)

private fun chatDateParts(epochMs: Long): ChatDateParts {
    val date = Instant.ofEpochMilli(epochMs).atZone(chatZone).toLocalDate()
    return ChatDateParts(date.year, date.monthValue, date.dayOfMonth)
}

fun chatDayLabel(epochMs: Long, now: Long = System.currentTimeMillis()): String {
    val key = chatDateParts(epochMs)
    val today = chatDateParts(now)
    if (key == today) return "Hôm nay"
    if (key == chatDateParts(now - 24 * 60 * 60 * 1000)) return "Hôm qua"
    if (today.year != key.year) return "%02d/%02d/%d".format(key.day, key.month, key.year)
    return "%02d/%02d".format(key.day, key.month)
}

fun formatChatListTime(value: Long, now: Long = System.currentTimeMillis()): String {
    if (value <= 0L) return ""
    val delta = now - value
    if (delta < 60 * 1000) return "Vừa xong"
    val today = chatDateParts(now)
    val then = chatDateParts(value)
    if (today == then) {
        if (delta < 60 * 60 * 1000) return "${maxOf(1L, delta / 60_000)} phút"
        return "${maxOf(1L, delta / 3_600_000)} giờ"
    }
    if (chatDayLabel(value, now) == "Hôm qua") return "Hôm qua"
    if (today.year != then.year) return "%02d/%02d/%d".format(then.day, then.month, then.year)
    return "%02d/%02d".format(then.day, then.month)
}

private fun normalizeChatSearch(value: String): String {
    val normalized = java.text.Normalizer.normalize(value, java.text.Normalizer.Form.NFD)
        .replace(Regex("\\p{Mn}+"), "")
        .replace('đ', 'd')
        .replace('Đ', 'D')
        .lowercase(Locale.forLanguageTag("vi-VN"))
    return normalized.replace(Regex("\\s+"), " ").trim()
}

fun chatRecallStillOpen(createdAt: Long, recalled: Boolean, now: Long): Boolean {
    if (recalled || createdAt <= 0L) return false
    return now - createdAt <= CHAT_RECALL_WINDOW_MS
}

fun chatAuthorInitials(name: String): String {
    val parts = name.trim().split(Regex("\\s+")).filter { it.isNotEmpty() }
    if (parts.isEmpty()) return "?"
    return parts.takeLast(2).joinToString("") { part ->
        part.take(1).uppercase(Locale.forLanguageTag("vi-VN"))
    }.ifBlank { "?" }
}

fun formatChatTime(epochMs: Long): String {
    if (epochMs <= 0L) return ""
    val formatter = DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm")
        .withLocale(Locale.forLanguageTag("vi-VN"))
        .withZone(ZoneId.of("Asia/Ho_Chi_Minh"))
    return formatter.format(Instant.ofEpochMilli(epochMs))
}

fun chatFailureMessage(raw: String, action: ChatAction): String {
    val code = raw.uppercase()
    return when {
        code.contains("CHAT_EMPTY") -> "Vui lòng nhập nội dung tin nhắn."
        code.contains("TOO_LONG") -> "Tin nhắn quá dài (tối đa 4000 ký tự)."
        code.contains("RECALL_TOO_LATE") -> "Đã quá 15 phút, không thể thu hồi tin nhắn này."
        code.contains("RECALL_FORBIDDEN") -> "Bạn chỉ có thể thu hồi tin nhắn của mình."
        code.contains("CHAT_FORBIDDEN") || code.contains("FORBIDDEN") ->
            "Bạn không có quyền trao đổi mục này."
        action == ChatAction.Send -> "Không gửi được tin nhắn. Vui lòng thử lại."
        action == ChatAction.Recall -> "Không thu hồi được tin nhắn. Vui lòng thử lại."
        else -> "Không tải được tin nhắn."
    }
}

// ponytail: prefix/suffix diff, not a real editor transaction. Identical characters can shift flags to the wrong side; upgrade path is a span editor that records the IME replace range.
fun chatApplyEdit(oldText: String, oldFlags: IntArray, newText: String, insertFlags: Int): IntArray {
    var prefix = 0
    val minLength = minOf(oldText.length, newText.length)
    while (prefix < minLength && oldText[prefix] == newText[prefix]) prefix++
    var suffix = 0
    while (
        suffix < oldText.length - prefix &&
        suffix < newText.length - prefix &&
        oldText[oldText.length - 1 - suffix] == newText[newText.length - 1 - suffix]
    ) {
        suffix++
    }
    val inserted = newText.length - prefix - suffix
    val flags = IntArray(newText.length)
    for (index in 0 until prefix) flags[index] = oldFlags.getOrElse(index) { 0 }
    for (index in 0 until inserted) flags[prefix + index] = insertFlags
    val oldSuffixStart = oldText.length - suffix
    for (index in 0 until suffix) flags[prefix + inserted + index] = oldFlags.getOrElse(oldSuffixStart + index) { 0 }
    return flags
}

fun chatToggleFlag(flags: IntArray, start: Int, endExclusive: Int, bit: Int): IntArray {
    if (start >= endExclusive || bit == 0) return flags
    val copy = flags.copyOf(maxOf(flags.size, endExclusive))
    val allSet = (start until endExclusive).all { index -> copy[index] and bit != 0 }
    for (index in start until endExclusive) {
        copy[index] = if (allSet) copy[index] and bit.inv() else copy[index] or bit
    }
    return copy
}

fun chatTextToHtml(text: String, flags: IntArray): String {
    if (text.isEmpty()) return ""
    val out = StringBuilder()
    var index = 0
    while (index < text.length) {
        if (text[index] == '\n') {
            out.append("<br>")
            index++
            continue
        }
        val flag = flags.getOrElse(index) { 0 }
        var end = index + 1
        while (end < text.length && text[end] != '\n' && flags.getOrElse(end) { 0 } == flag) end++
        var chunk = chatEscape(text.substring(index, end))
        if (flag and CHAT_UNDERLINE != 0) chunk = "<u>$chunk</u>"
        if (flag and CHAT_ITALIC != 0) chunk = "<i>$chunk</i>"
        if (flag and CHAT_BOLD != 0) chunk = "<b>$chunk</b>"
        out.append(chunk)
        index = end
    }
    return out.toString()
}

fun chatHtmlToRuns(html: String): List<ChatRun> {
    val source = stripUnsafe(html)
    val runs = mutableListOf<ChatRun>()
    var bold = 0
    var italic = 0
    var underline = 0
    val lists = ArrayDeque<String>()
    val olCounts = ArrayDeque<Int>()
    fun emit(text: String) {
        if (text.isEmpty()) return
        val run = ChatRun(text, bold > 0, italic > 0, underline > 0)
        val previous = runs.lastOrNull()
        if (
            previous != null &&
            previous.bold == run.bold &&
            previous.italic == run.italic &&
            previous.underline == run.underline
        ) {
            runs[runs.lastIndex] = previous.copy(text = previous.text + text)
        } else {
            runs += run
        }
    }
    fun emitBreak() {
        if (runs.isEmpty() || !runs.last().text.endsWith("\n")) emit("\n")
    }
    var index = 0
    while (index < source.length) {
        if (source[index] != '<') {
            val next = source.indexOf('<', index).let { if (it < 0) source.length else it }
            emit(chatDecodeEntities(source.substring(index, next)))
            index = next
            continue
        }
        val close = source.indexOf('>', index)
        if (close < 0) {
            emit(chatDecodeEntities(source.substring(index)))
            break
        }
        val raw = source.substring(index + 1, close).trim()
        index = close + 1
        val closing = raw.startsWith("/")
        val name = raw.removePrefix("/").substringBefore(' ').substringBefore('/').lowercase()
        when (name) {
            "b", "strong" -> if (closing) bold = (bold - 1).coerceAtLeast(0) else bold++
            "i", "em" -> if (closing) italic = (italic - 1).coerceAtLeast(0) else italic++
            "u" -> if (closing) underline = (underline - 1).coerceAtLeast(0) else underline++
            "br" -> if (!closing) emit("\n")
            "p", "div" -> if (closing) emitBreak()
            "ul" -> if (!closing) {
                lists.addLast("ul")
            } else if (lists.lastOrNull() == "ul") {
                lists.removeLast()
            }
            "ol" -> if (!closing) {
                lists.addLast("ol")
                olCounts.addLast(0)
            } else if (lists.lastOrNull() == "ol") {
                lists.removeLast()
                if (olCounts.isNotEmpty()) olCounts.removeLast()
            }
            "li" -> if (!closing) {
                emitBreak()
                when (lists.lastOrNull()) {
                    "ol" -> {
                        val count = (olCounts.removeLastOrNull() ?: 0) + 1
                        olCounts.addLast(count)
                        emit("$count. ")
                    }
                    "ul" -> emit("• ")
                }
            } else {
                emitBreak()
            }
        }
    }
    return chatTrimEdgeNewlines(runs)
}

fun workChatTarget(
    focusId: String,
    tasks: List<WorkTaskItem>,
    approvals: List<WorkApprovalItem>,
): ChatTarget {
    val approval = approvals.firstOrNull { item ->
        item.id == focusId || item.assignments.any { it.id == focusId }
    }
    if (approval != null && approval.id == focusId) {
        val title = approval.title.ifBlank { approval.content.ifBlank { approval.fileName } }.ifBlank { "Công việc" }
        return ChatTarget(ChatKind.Work, approval.id, title)
    }
    val task = tasks.firstOrNull { it.id == focusId || it.documentId == focusId }
    val documentId = task?.documentId?.takeIf { it.isNotBlank() } ?: focusId
    val title = task?.documentTitle?.takeIf { it.isNotBlank() }
        ?: task?.title?.takeIf { it.isNotBlank() }
        ?: "Công việc"
    return ChatTarget(ChatKind.Work, documentId, title)
}

internal fun chatEscape(value: String): String = value
    .replace("&", "&amp;")
    .replace("<", "&lt;")
    .replace(">", "&gt;")
    .replace("\"", "&quot;")

internal fun chatDecodeEntities(value: String): String {
    val out = StringBuilder()
    var index = 0
    while (index < value.length) {
        if (value[index] == '&') {
            val semi = value.indexOf(';', index + 1)
            if (semi > index && semi - index <= 12) {
                val token = value.substring(index + 1, semi)
                val decoded = when (token.lowercase()) {
                    "amp" -> "&"
                    "lt" -> "<"
                    "gt" -> ">"
                    "quot" -> "\""
                    "nbsp" -> " "
                    else -> if (token.startsWith("#") && token.drop(1).all { it.isDigit() }) {
                        val code = token.drop(1).toInt()
                        if (code >= 32) code.toChar().toString() else ""
                    } else {
                        null
                    }
                }
                if (decoded != null) {
                    out.append(decoded)
                    index = semi + 1
                    continue
                }
            }
        }
        out.append(value[index])
        index++
    }
    return out.toString()
}

private fun stripUnsafe(html: String): String {
    var value = html
    value = Regex("<!--[\\s\\S]*?-->").replace(value, "")
    value = Regex("<script\\b[\\s\\S]*?</script>", RegexOption.IGNORE_CASE).replace(value, "")
    value = Regex("<style\\b[\\s\\S]*?</style>", RegexOption.IGNORE_CASE).replace(value, "")
    return value
}

private fun chatTrimEdgeNewlines(runs: List<ChatRun>): List<ChatRun> {
    if (runs.isEmpty()) return runs
    val copy = runs.toMutableList()
    copy[0] = copy[0].copy(text = copy[0].text.trimStart('\n'))
    if (copy[0].text.isEmpty()) copy.removeAt(0)
    if (copy.isEmpty()) return copy
    val last = copy.lastIndex
    copy[last] = copy[last].copy(text = copy[last].text.trimEnd('\n'))
    if (copy[last].text.isEmpty()) copy.removeAt(last)
    return copy
}
