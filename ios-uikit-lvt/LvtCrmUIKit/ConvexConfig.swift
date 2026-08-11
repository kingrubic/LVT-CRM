import Foundation

enum ConvexConfig {
    static let webURL = "https://lvt.vscgroup.io.vn"

    static var url: String {
        if let override = Bundle.main.object(forInfoDictionaryKey: "LVTConvexURL") as? String,
           !override.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return override.trimmingCharacters(in: .whitespacesAndNewlines)
        }
        #if DEBUG
        return ProcessInfo.processInfo.environment["LVT_CONVEX_URL"]
            ?? "https://lvt-convex.vscgroup.io.vn"
        #else
        return "https://lvt-convex.vscgroup.io.vn"
        #endif
    }

    static var appId: String {
        Bundle.main.bundleIdentifier ?? "vn.lvt.crm"
    }
}
