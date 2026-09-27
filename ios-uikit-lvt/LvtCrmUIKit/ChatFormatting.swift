import UIKit

let chatRecallWindowMs: Int64 = 15 * 60 * 1000
let chatRecalledPlaceholder = "Tin nhắn đã được thu hồi"
let chatTextMaxLength = 4000

let chatBold = 1
let chatItalic = 2
let chatUnderline = 4

enum ChatKind: Equatable, Sendable {
    case duty
    case work
}

enum ChatAction {
    case load
    case send
    case recall
}

struct ChatTarget: Equatable, Sendable {
    let kind: ChatKind
    let entityId: String
    let title: String
}

struct ChatMessage: Equatable, Sendable, Identifiable {
    let id: String
    let authorName: String
    let authorInitials: String
    let bodyHtml: String
    let createdAt: Int64
    let recalled: Bool
    let canRecall: Bool
    let isSelf: Bool
}

struct ChatThread: Equatable, Sendable {
    let title: String
    let messages: [ChatMessage]
}

struct ChatRun: Equatable {
    var text: String
    var bold: Bool = false
    var italic: Bool = false
    var underline: Bool = false
}

func chatContextText(_ kind: ChatKind) -> String {
    switch kind {
    case .duty: return "Tin nhắn hiển thị cho người đã thấy công tác này."
    case .work: return "Tin nhắn hiển thị cho người đã thấy công việc này."
    }
}

func chatRecallStillOpen(createdAt: Int64, recalled: Bool, now: Int64) -> Bool {
    if recalled || createdAt <= 0 { return false }
    return now - createdAt <= chatRecallWindowMs
}

func chatAuthorInitials(_ name: String) -> String {
    let parts = name.split(whereSeparator: { $0.isWhitespace }).map(String.init)
    guard !parts.isEmpty else { return "?" }
    let initials = parts.suffix(2).compactMap { $0.first }.map { String($0).uppercased(with: Locale(identifier: "vi_VN")) }
    let value = initials.joined()
    return value.isEmpty ? "?" : value
}

func formatChatTime(_ epochMs: Int64) -> String {
    guard epochMs > 0 else { return "" }
    return chatTimeFormatter.string(from: Date(timeIntervalSince1970: TimeInterval(epochMs) / 1000))
}

private let chatTimeFormatter: DateFormatter = {
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: "vi_VN")
    formatter.timeZone = TimeZone(identifier: "Asia/Ho_Chi_Minh")
    formatter.dateFormat = "dd/MM/yyyy HH:mm"
    return formatter
}()

func chatFailureMessage(_ raw: String, action: ChatAction) -> String {
    let code = raw.uppercased()
    if code.contains("CHAT_EMPTY") { return "Vui lòng nhập nội dung tin nhắn." }
    if code.contains("TOO_LONG") { return "Tin nhắn quá dài (tối đa 4000 ký tự)." }
    if code.contains("RECALL_TOO_LATE") { return "Đã quá 15 phút, không thể thu hồi tin nhắn này." }
    if code.contains("RECALL_FORBIDDEN") { return "Bạn chỉ có thể thu hồi tin nhắn của mình." }
    if code.contains("CHAT_FORBIDDEN") || code.contains("FORBIDDEN") {
        return "Bạn không có quyền trao đổi mục này."
    }
    switch action {
    case .send: return "Không gửi được tin nhắn. Vui lòng thử lại."
    case .recall: return "Không thu hồi được tin nhắn. Vui lòng thử lại."
    case .load: return "Không tải được tin nhắn."
    }
}

func chatTextToHtml(_ text: String, flags: [Int]) -> String {
    guard !text.isEmpty else { return "" }
    var html = ""
    var index = text.startIndex
    while index < text.endIndex {
        if text[index] == "\n" {
            html += "<br>"
            index = text.index(after: index)
            continue
        }
        let flag = chatFlag(flags, offset: text.distance(from: text.startIndex, to: index))
        var end = text.index(after: index)
        while end < text.endIndex && text[end] != "\n" &&
            chatFlag(flags, offset: text.distance(from: text.startIndex, to: end)) == flag {
            end = text.index(after: end)
        }
        var chunk = chatEscape(String(text[index..<end]))
        if flag & chatUnderline != 0 { chunk = "<u>\(chunk)</u>" }
        if flag & chatItalic != 0 { chunk = "<i>\(chunk)</i>" }
        if flag & chatBold != 0 { chunk = "<b>\(chunk)</b>" }
        html += chunk
        index = end
    }
    return html
}

func chatHtmlToRuns(_ html: String) -> [ChatRun] {
    let source = stripUnsafe(html)
    var runs: [ChatRun] = []
    var bold = 0
    var italic = 0
    var underline = 0
    var lists: [String] = []
    var olCounts: [Int] = []

    func emit(_ text: String) {
        guard !text.isEmpty else { return }
        let run = ChatRun(text: text, bold: bold > 0, italic: italic > 0, underline: underline > 0)
        if var previous = runs.last,
           previous.bold == run.bold && previous.italic == run.italic && previous.underline == run.underline {
            previous.text += text
            runs[runs.count - 1] = previous
        } else {
            runs.append(run)
        }
    }
    func emitBreak() {
        if runs.isEmpty || runs[runs.count - 1].text.hasSuffix("\n") { return }
        emit("\n")
    }

    var index = source.startIndex
    while index < source.endIndex {
        if source[index] != "<" {
            let next = source[index...].firstIndex(of: "<") ?? source.endIndex
            emit(chatDecodeEntities(String(source[index..<next])))
            index = next
            continue
        }
        guard let close = source[index...].firstIndex(of: ">") else {
            emit(chatDecodeEntities(String(source[index...])))
            break
        }
        let raw = source[source.index(after: index)..<close].trimmingCharacters(in: .whitespacesAndNewlines)
        index = source.index(after: close)
        let closing = raw.hasPrefix("/")
        let nameSource = raw.hasPrefix("/") ? String(raw.dropFirst()) : raw
        let name = nameSource.split(whereSeparator: { $0 == " " || $0 == "/" }).first.map { String($0).lowercased() } ?? ""
        switch name {
        case "b", "strong":
            bold = closing ? max(0, bold - 1) : bold + 1
        case "i", "em":
            italic = closing ? max(0, italic - 1) : italic + 1
        case "u":
            underline = closing ? max(0, underline - 1) : underline + 1
        case "br":
            if !closing { emit("\n") }
        case "p", "div":
            if closing { emitBreak() }
        case "ul":
            if !closing {
                lists.append("ul")
            } else if lists.last == "ul" {
                lists.removeLast()
            }
        case "ol":
            if !closing {
                lists.append("ol")
                olCounts.append(0)
            } else if lists.last == "ol" {
                lists.removeLast()
                if !olCounts.isEmpty { olCounts.removeLast() }
            }
        case "li":
            if !closing {
                emitBreak()
                if lists.last == "ol" {
                    let count = (olCounts.popLast() ?? 0) + 1
                    olCounts.append(count)
                    emit("\(count). ")
                } else if lists.last == "ul" {
                    emit("• ")
                }
            } else {
                emitBreak()
            }
        default:
            break
        }
    }
    return chatTrimEdgeNewlines(runs)
}

func workChatTarget(focusId: String, tasks: [WorkTaskItem], approvals: [WorkApprovalItem]) -> ChatTarget {
    if let approval = approvals.first(where: { $0.id == focusId }) {
        let title = [approval.title, approval.content, approval.fileName].first { !$0.isEmpty } ?? "Công việc"
        return ChatTarget(kind: .work, entityId: approval.id, title: title)
    }
    let task = tasks.first { $0.id == focusId || $0.documentId == focusId }
    let documentId = task?.documentId.nonEmpty ?? focusId
    let title = task?.documentTitle.nonEmpty ?? task?.title.nonEmpty ?? "Công việc"
    return ChatTarget(kind: .work, entityId: documentId, title: title)
}

func chatAttributedHtml(_ text: NSAttributedString) -> String {
    var html = ""
    text.enumerateAttributes(in: NSRange(location: 0, length: text.length)) { attributes, range, _ in
        let chunk = text.attributedSubstring(from: range).string
        let font = attributes[.font] as? UIFont ?? UIFont.preferredFont(forTextStyle: .body)
        let traits = font.fontDescriptor.symbolicTraits
        let underline = (attributes[.underlineStyle] as? Int ?? 0) != 0
        var piece = chatEscape(chunk).replacingOccurrences(of: "\n", with: "<br>")
        if underline { piece = "<u>\(piece)</u>" }
        if traits.contains(.traitItalic) { piece = "<i>\(piece)</i>" }
        if traits.contains(.traitBold) { piece = "<b>\(piece)</b>" }
        html += piece
    }
    return html
}

func chatRunsToAttributed(_ runs: [ChatRun]) -> NSAttributedString {
    let base = UIFont.preferredFont(forTextStyle: .body)
    let result = NSMutableAttributedString()
    for run in runs {
        var traits = UIFontDescriptor.SymbolicTraits()
        if run.bold { traits.insert(.traitBold) }
        if run.italic { traits.insert(.traitItalic) }
        let font = base.fontDescriptor.withSymbolicTraits(traits).map {
            UIFont(descriptor: $0, size: base.pointSize)
        } ?? base
        var attributes: [NSAttributedString.Key: Any] = [
            .font: font,
            .foregroundColor: UIColor.label,
        ]
        if run.underline {
            attributes[.underlineStyle] = NSUnderlineStyle.single.rawValue
        }
        result.append(NSAttributedString(string: run.text, attributes: attributes))
    }
    return result
}

private func chatFlag(_ flags: [Int], offset: Int) -> Int {
    guard offset >= 0, offset < flags.count else { return 0 }
    return flags[offset]
}

func chatEscape(_ value: String) -> String {
    value
        .replacingOccurrences(of: "&", with: "&amp;")
        .replacingOccurrences(of: "<", with: "&lt;")
        .replacingOccurrences(of: ">", with: "&gt;")
        .replacingOccurrences(of: "\"", with: "&quot;")
}

func chatDecodeEntities(_ value: String) -> String {
    var output = ""
    var index = value.startIndex
    while index < value.endIndex {
        if value[index] == "&" {
            if let semi = value[value.index(after: index)...].firstIndex(of: ";"),
               value.distance(from: index, to: semi) <= 12 {
                let token = String(value[value.index(after: index)..<semi])
                if let decoded = decodeEntity(token) {
                    output += decoded
                    index = value.index(after: semi)
                    continue
                }
            }
        }
        output.append(value[index])
        index = value.index(after: index)
    }
    return output
}

private func decodeEntity(_ token: String) -> String? {
    switch token.lowercased() {
    case "amp": return "&"
    case "lt": return "<"
    case "gt": return ">"
    case "quot": return "\""
    case "nbsp": return " "
    default:
        guard token.hasPrefix("#"), let code = Int(token.dropFirst()), code >= 32 else { return nil }
        guard let scalar = UnicodeScalar(code) else { return "" }
        return String(Character(scalar))
    }
}

private func stripUnsafe(_ html: String) -> String {
    var value = html
    value = value.replacingOccurrences(of: #"<!--[\s\S]*?-->"#, with: "", options: .regularExpression)
    value = value.replacingOccurrences(
        of: #"<script\b[\s\S]*?</script>"#,
        with: "",
        options: [.regularExpression, .caseInsensitive]
    )
    value = value.replacingOccurrences(
        of: #"<style\b[\s\S]*?</style>"#,
        with: "",
        options: [.regularExpression, .caseInsensitive]
    )
    return value
}

private func chatTrimEdgeNewlines(_ runs: [ChatRun]) -> [ChatRun] {
    guard !runs.isEmpty else { return runs }
    var copy = runs
    copy[0].text = String(copy[0].text.drop(while: { $0 == "\n" }))
    if copy[0].text.isEmpty { copy.removeFirst() }
    guard !copy.isEmpty else { return copy }
    let last = copy.count - 1
    copy[last].text = String(copy[last].text.reversed().drop(while: { $0 == "\n" }).reversed())
    if copy[last].text.isEmpty { copy.removeLast() }
    return copy
}

private extension String {
    var nonEmpty: String? {
        isEmpty ? nil : self
    }
}
