import UIKit
import Capacitor

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?
    /// Extra time iOS grants after the user leaves Forgr (about 30 s), so an
    /// AI request that is almost done can finish instead of being dropped.
    private var backgroundTask: UIBackgroundTaskIdentifier = .invalid

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = CAPBridgeViewController()
        window?.makeKeyAndVisible()

        NotificationCenter.default.addObserver(forName: Notification.Name("ForgrWidgetDidRequestOpen"), object: nil, queue: .main) { [weak self] _ in
            guard let controller = self?.window?.rootViewController as? CAPBridgeViewController else { return }
            controller.bridge?.triggerWindowJSEvent(eventName: "forgr-widget-open")
        }

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }

    func sceneDidEnterBackground(_ scene: UIScene) {
        endBackgroundTask()
        backgroundTask = UIApplication.shared.beginBackgroundTask(withName: "MappFinishRequest") { [weak self] in
            self?.endBackgroundTask()
        }
    }

    func sceneWillEnterForeground(_ scene: UIScene) {
        endBackgroundTask()
    }

    private func endBackgroundTask() {
        guard backgroundTask != .invalid else { return }
        UIApplication.shared.endBackgroundTask(backgroundTask)
        backgroundTask = .invalid
    }
}
