import SwiftUI
import UserNotifications

@main
struct SeintjeApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var delegate
    @Environment(\.scenePhase) private var fase

    var body: some Scene {
        WindowGroup {
            OverzichtView()
                .task { await Store.shared.vraagPushToestemming() }
        }
        .onChange(of: fase) { _, nieuw in
            if nieuw == .active { Task { await Store.shared.laad() } }
        }
    }
}

final class AppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        return true
    }

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        let token = deviceToken.map { String(format: "%02x", $0) }.joined()
        Task { await Store.shared.registreerApparaat(token) }
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: any Error) {
        Store.shared.pushStatus = "Push niet beschikbaar: \(error.localizedDescription)"
    }

    // Melding komt binnen terwijl de app open is: toon hem en ververs de lijst
    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification) async -> UNNotificationPresentationOptions {
        await Store.shared.laad()
        return [.banner, .sound, .list]
    }

    // Op een melding getikt: open die melding
    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse) async {
        let id = response.notification.request.content.userInfo["id"] as? String
        await Store.shared.laad()
        await MainActor.run { Store.shared.openId = id }
    }
}
