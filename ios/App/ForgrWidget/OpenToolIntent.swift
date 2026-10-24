import AppIntents
import CapgoWidgetKitShared
import Foundation

/// A Home Screen button. Writes the tool id into the widget kit store, then opens Forgr.
@available(iOS 17.0, *)
struct OpenForgrToolIntent: AppIntent {
    static var title: LocalizedStringResource = "Open Forgr tool"
    static var openAppWhenRun = true
    static var isDiscoverable = false

    @Parameter(title: "Tool")
    var toolId: String

    init() {
        toolId = ""
    }

    init(toolId: String) {
        self.toolId = toolId
    }

    func perform() async throws -> some IntentResult {
        let bridge = try CapgoNativeWidgetBridge()
        _ = try bridge.sendMessage(
            widgetId: "forgr-tools",
            name: "open",
            direction: .widgetToApp,
            payloadObject: ["appId": toolId],
            expectsResponse: false
        )
        // openAppWhenRun runs this in the app process. The web view only hears resume
        // when the app was in the background, so tell it directly when it is already open.
        NotificationCenter.default.post(name: Notification.Name("ForgrWidgetDidRequestOpen"), object: nil)
        return .result()
    }
}
