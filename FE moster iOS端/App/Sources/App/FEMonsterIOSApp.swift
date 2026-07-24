import SwiftUI

@main
@MainActor
struct FEMonsterIOSApp: App {
    @StateObject private var gateway = NodeGatewayController()

    init() {
        AudioSessionConfigurator.configure()
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(gateway)
                .preferredColorScheme(.dark)
        }
    }
}
