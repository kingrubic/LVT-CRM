import SwiftUI

struct SchoolLogo: View {
    var size: CGFloat = 72

    var body: some View {
        Image("LogoLvt")
            .resizable()
            .scaledToFit()
            .frame(width: size, height: size)
            .clipShape(RoundedRectangle(cornerRadius: size * 0.22, style: .continuous))
            .glassEffect(.regular, in: .rect(cornerRadius: size * 0.22))
    }
}

struct EmptyStatePanel: View {
    let title: String
    let message: String

    var body: some View {
        VStack(spacing: 10) {
            Image(systemName: "tray")
                .font(.system(size: 28, weight: .semibold))
                .foregroundStyle(LvtColors.schoolIndigo.opacity(0.7))
            Text(title)
                .font(.headline)
                .foregroundStyle(LvtColors.ink)
            Text(message)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(28)
        .glassEffect(.regular, in: .rect(cornerRadius: 24))
    }
}

struct ErrorPanel: View {
    let message: String
    var retry: (() -> Void)?

    var body: some View {
        VStack(spacing: 12) {
            Text(message)
                .font(.subheadline)
                .foregroundStyle(LvtColors.torchRed)
                .multilineTextAlignment(.center)
            if let retry {
                Button("Thử lại", action: retry)
                    .buttonStyle(.glassProminent)
                    .tint(LvtColors.schoolIndigo)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(20)
        .glassEffect(.regular.tint(LvtColors.torchRed.opacity(0.12)), in: .rect(cornerRadius: 22))
    }
}

struct SectionHeader: View {
    let title: String
    var subtitle: String? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title)
                .font(.title3.weight(.semibold))
                .foregroundStyle(LvtColors.schoolIndigo)
            if let subtitle {
                Text(subtitle)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

struct LoadingPlaceholder: View {
    var body: some View {
        ZStack {
            AmbientBackground()
            VStack(spacing: 18) {
                SchoolLogo(size: 96)
                Text("THCS Lê Văn Tám")
                    .font(.title2.weight(.bold))
                    .foregroundStyle(LvtColors.schoolIndigo)
                Text("Đang tải…")
                    .foregroundStyle(.secondary)
                ProgressView()
                    .tint(LvtColors.schoolIndigo)
            }
            .padding(28)
            .glassEffect(.regular, in: .rect(cornerRadius: 28))
            .padding(24)
        }
    }
}

struct InfoRow: View {
    let label: String
    let value: String

    var body: some View {
        HStack(alignment: .top) {
            Text(label)
                .font(.subheadline.weight(.medium))
                .foregroundStyle(.secondary)
                .frame(width: 110, alignment: .leading)
            Text(value)
                .font(.subheadline)
                .foregroundStyle(LvtColors.ink)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

enum DateFormatters {
    static let vietnamDue: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "vi_VN")
        formatter.timeZone = TimeZone(identifier: "Asia/Ho_Chi_Minh")
        formatter.dateFormat = "dd/MM/yyyy HH:mm"
        return formatter
    }()

    static func dueString(from millis: Int64) -> String {
        guard millis > 0 else { return "" }
        let date = Date(timeIntervalSince1970: TimeInterval(millis) / 1000)
        return vietnamDue.string(from: date)
    }
}
