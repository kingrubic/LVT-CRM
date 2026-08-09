import Foundation
import Combine

enum PushEvents {
    static let received = PassthroughSubject<Void, Never>()

    static func emit() {
        received.send(())
    }
}
