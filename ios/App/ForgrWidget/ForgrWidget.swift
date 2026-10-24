import CapgoWidgetKitShared
import SwiftUI
import WidgetKit

/// Slot counts match src/widget/layout.ts.
private func slotCount(layout: String, size: String) -> Int {
    switch layout {
    case "open": return 1
    case "tiny": return size == "large" ? 12 : size == "medium" ? 8 : 4
    case "big": return size == "large" ? 4 : size == "medium" ? 2 : 1
    default: return size == "large" ? 6 : size == "medium" ? 4 : 2
    }
}

private func columns(layout: String, size: String) -> Int {
    switch layout {
    case "open": return 1
    case "tiny": return size == "small" ? 2 : 4
    case "big": return size == "small" ? 1 : 2
    default: return size == "large" ? 3 : size == "small" ? 2 : 4
    }
}

private func widgetSize(_ family: WidgetFamily) -> String {
    switch family {
    case .systemLarge: return "large"
    case .systemMedium: return "medium"
    default: return "small"
    }
}

struct ForgrTool: Identifiable, Hashable {
    let id: String
    let name: String
    let emoji: String
    let color: String
}

struct ForgrEntry: TimelineEntry {
    let date: Date
    let layout: String
    let tools: [ForgrTool]
}

private let galleryTools = [
    ForgrTool(id: "habits", name: "Habits", emoji: "✅", color: "#34c759"),
    ForgrTool(id: "tips", name: "Tip Split", emoji: "💸", color: "#ff9500"),
    ForgrTool(id: "focus", name: "Focus", emoji: "⏳", color: "#5856d6"),
    ForgrTool(id: "plants", name: "Plants", emoji: "🌱", color: "#30d158"),
]

private func loadEntry() -> ForgrEntry {
    let empty = ForgrEntry(date: Date(), layout: "regular", tools: [])
    guard let bridge = try? CapgoNativeWidgetBridge(),
          let session = bridge.loadSession(widgetId: "forgr-tools"),
          let object = try? JSONSerialization.jsonObject(with: session.stateData) as? [String: Any]
    else { return empty }
    let layout = object["layout"] as? String ?? "regular"
    let tools = (object["tools"] as? [[String: Any]] ?? []).compactMap { item -> ForgrTool? in
        guard let id = item["id"] as? String, let name = item["name"] as? String else { return nil }
        return ForgrTool(
            id: id,
            name: name,
            emoji: item["emoji"] as? String ?? "✨",
            color: item["color"] as? String ?? "#8e8e93"
        )
    }
    return ForgrEntry(date: Date(), layout: layout, tools: tools)
}

private func tileColor(_ hex: String) -> Color {
    let fallback = Color(red: 142.0 / 255, green: 142.0 / 255, blue: 147.0 / 255)
    var text = hex.trimmingCharacters(in: .whitespacesAndNewlines)
    if text.hasPrefix("#") { text.removeFirst() }
    guard text.count == 6 || text.count == 8 else { return fallback }
    var value: UInt64 = 0
    let scanner = Scanner(string: text)
    guard scanner.scanHexInt64(&value), scanner.isAtEnd else { return fallback }
    let rgb = text.count == 8 ? value & 0xFFFFFF : value
    return Color(
        red: Double((rgb >> 16) & 0xFF) / 255,
        green: Double((rgb >> 8) & 0xFF) / 255,
        blue: Double(rgb & 0xFF) / 255
    )
}

struct ForgrTimeline: TimelineProvider {
    func placeholder(in context: Context) -> ForgrEntry {
        ForgrEntry(date: Date(), layout: "regular", tools: galleryTools)
    }

    func getSnapshot(in context: Context, completion: @escaping (ForgrEntry) -> Void) {
        let stored = loadEntry()
        completion(stored.tools.isEmpty && stored.layout != "open"
            ? ForgrEntry(date: Date(), layout: "regular", tools: galleryTools)
            : stored)
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<ForgrEntry>) -> Void) {
        let entry = loadEntry()
        completion(Timeline(entries: [entry], policy: .after(Date().addingTimeInterval(30 * 60))))
    }
}

struct ForgrToolsWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "ForgrToolsWidget", provider: ForgrTimeline()) { entry in
            ForgrToolsView(entry: entry)
        }
        .configurationDisplayName("Forgr")
        .description("Open your tools in one tap.")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
        .contentMarginsDisabled()
    }
}

struct ForgrToolsView: View {
    @Environment(\.widgetFamily) private var family
    let entry: ForgrEntry

    var body: some View {
        let size = widgetSize(family)
        Group {
            if entry.layout == "open" {
                launchButton(id: "") { openLabel }
            } else if entry.tools.isEmpty {
                launchButton(id: "") { emptyLabel }
            } else {
                let shown = Array(entry.tools.prefix(slotCount(layout: entry.layout, size: size)))
                let cols = max(columns(layout: entry.layout, size: size), 1)
                let rows = Int((shown.count + cols - 1) / cols)
                let side = iconSide(entry.layout)
                VStack(spacing: 14) {
                    ForEach(0..<rows, id: \.self) { row in
                        HStack(spacing: entry.layout == "tiny" ? 14 : 18) {
                            ForEach(0..<cols, id: \.self) { column in
                                toolButton(shown, index: row * cols + column, side: side, named: entry.layout != "tiny")
                            }
                        }
                    }
                }
            }
        }
        .padding(8)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
        .containerBackground(.background, for: .widget)
    }

    /// Same footprint as a Home Screen icon. Tiny is a bit smaller, Big a bit larger. Never a stretched bar.
    private func iconSide(_ layout: String) -> CGFloat {
        switch layout {
        case "tiny": return 46
        case "big": return 74
        default: return 60
        }
    }

    @ViewBuilder
    private func toolButton(_ shown: [ForgrTool], index: Int, side: CGFloat, named: Bool) -> some View {
        if index < shown.count {
            Button(intent: OpenForgrToolIntent(toolId: shown[index].id)) {
                toolIcon(shown[index], side: side, named: named)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(shown[index].name)
        }
    }

    private func toolIcon(_ tool: ForgrTool, side: CGFloat, named: Bool) -> some View {
        VStack(spacing: 4) {
            Text(tool.emoji)
                .font(.system(size: side * 0.42))
                .frame(width: side, height: side)
                .background(tileColor(tool.color), in: RoundedRectangle(cornerRadius: side * 0.225, style: .continuous))
            if named {
                Text(tool.name)
                    .font(.system(size: 11, weight: .medium))
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
                    .frame(width: side)
                    .foregroundStyle(.primary)
            }
        }
    }

    private var openLabel: some View {
        VStack(spacing: 2) {
            Text("Forgr").font(.system(size: 22, weight: .semibold)).foregroundStyle(Color.white)
            Text("Open").font(.system(size: 13, weight: .medium)).foregroundStyle(Color.white.opacity(0.6))
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color(red: 0.173, green: 0.173, blue: 0.180), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }

    private var emptyLabel: some View {
        Text("Pin tools in Forgr")
            .font(.system(size: 13, weight: .medium))
            .foregroundStyle(.secondary)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func launchButton<Label: View>(id: String, @ViewBuilder label: () -> Label) -> some View {
        Button(intent: OpenForgrToolIntent(toolId: id)) { label() }
            .buttonStyle(.plain)
    }
}

@main
struct ForgrWidgetBundle: WidgetBundle {
    var body: some Widget {
        ForgrToolsWidget()
    }
}
