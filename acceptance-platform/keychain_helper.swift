import Foundation
import Security

let service = "com.bemi.lvt-acceptance-platform.admin"
let account = "admin"

func fail(_ message: String) -> Never {
    FileHandle.standardError.write(Data((message + "\n").utf8))
    exit(1)
}

func getPassword() -> String {
    let query: [String: Any] = [
        kSecClass as String: kSecClassGenericPassword,
        kSecAttrService as String: service,
        kSecAttrAccount as String: account,
        kSecReturnData as String: true,
        kSecMatchLimit as String: kSecMatchLimitOne,
    ]
    var result: CFTypeRef?
    let status = SecItemCopyMatching(query as CFDictionary, &result)
    guard status == errSecSuccess, let data = result as? Data,
          let password = String(data: data, encoding: .utf8) else {
        fail("keychain read failed: \(status)")
    }
    return password
}

func setPassword(_ password: String) {
    let query: [String: Any] = [
        kSecClass as String: kSecClassGenericPassword,
        kSecAttrService as String: service,
        kSecAttrAccount as String: account,
    ]
    let attributes: [String: Any] = [kSecValueData as String: Data(password.utf8)]
    let updateStatus = SecItemUpdate(query as CFDictionary, attributes as CFDictionary)
    if updateStatus == errSecItemNotFound {
        var addQuery = query
        addQuery[kSecValueData as String] = Data(password.utf8)
        let addStatus = SecItemAdd(addQuery as CFDictionary, nil)
        guard addStatus == errSecSuccess else { fail("keychain add failed: \(addStatus)") }
    } else if updateStatus != errSecSuccess {
        fail("keychain update failed: \(updateStatus)")
    }
}

guard CommandLine.arguments.count == 2 else {
    fail("usage: keychain_helper get|set")
}
switch CommandLine.arguments[1] {
case "get":
    FileHandle.standardOutput.write(Data((getPassword() + "\n").utf8))
case "set":
    let input = FileHandle.standardInput.readDataToEndOfFile()
    guard let password = String(data: input, encoding: .utf8) else { fail("invalid input") }
    let normalized = password.trimmingCharacters(in: .newlines)
    guard !normalized.isEmpty else { fail("empty password") }
    setPassword(normalized)
default:
    fail("usage: keychain_helper get|set")
}
