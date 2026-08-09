import SwiftUI

enum LvtColors {
    static let schoolIndigo = Color(red: 0.247, green: 0.169, blue: 0.549)
    static let schoolIndigoDark = Color(red: 0.157, green: 0.094, blue: 0.431)
    static let torchRed = Color(red: 0.702, green: 0.149, blue: 0.118)
    static let teal = Color(red: 0.0, green: 0.420, blue: 0.384)
    static let ink = Color(red: 0.141, green: 0.129, blue: 0.169)
    static let warmPaper = Color(red: 0.988, green: 0.976, blue: 1.0)
    static let primaryContainer = Color(red: 0.910, green: 0.871, blue: 1.0)
    static let secondaryContainer = Color(red: 0.698, green: 0.945, blue: 0.906)
}

struct AmbientBackground: View {
    var body: some View {
        ZStack {
            LvtColors.warmPaper
            RadialGradient(
                colors: [
                    LvtColors.primaryContainer.opacity(0.85),
                    LvtColors.warmPaper.opacity(0.2),
                ],
                center: .topLeading,
                startRadius: 20,
                endRadius: 420
            )
            RadialGradient(
                colors: [
                    LvtColors.secondaryContainer.opacity(0.45),
                    .clear,
                ],
                center: .bottomTrailing,
                startRadius: 10,
                endRadius: 360
            )
        }
        .ignoresSafeArea()
    }
}

struct GlassCard<Content: View>: View {
    var tint: Color? = nil
    @ViewBuilder var content: () -> Content

    var body: some View {
        content()
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .glassEffect(
                tint.map { .regular.tint($0.opacity(0.18)) } ?? .regular,
                in: .rect(cornerRadius: 22)
            )
    }
}

struct StatusPill: View {
    let text: String
    var tone: Tone = .neutral

    enum Tone {
        case neutral, success, warning, danger, accent

        var tint: Color {
            switch self {
            case .neutral: return .secondary
            case .success: return LvtColors.teal
            case .warning: return .orange
            case .danger: return LvtColors.torchRed
            case .accent: return LvtColors.schoolIndigo
            }
        }
    }

    var body: some View {
        Text(text)
            .font(.caption.weight(.semibold))
            .foregroundStyle(tone.tint)
            .padding(.horizontal, 10)
            .padding(.vertical, 5)
            .glassEffect(.regular.tint(tone.tint.opacity(0.18)), in: .capsule)
    }
}
