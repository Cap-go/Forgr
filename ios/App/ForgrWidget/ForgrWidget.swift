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
    var text = hex.trimmingCharacters(in: .whitespacesAndNewlines)
    if text.hasPrefix("#") { text.removeFirst() }
    var value: UInt64 = 0
    Scanner(string: text).scanHexInt64(&value)
    return Color(
        red: Double((value >> 16) & 0xFF) / 255,
        green: Double((value >> 8) & 0xFF) / 255,
        blue: Double(value & 0xFF) / 255
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
                let cols = columns(layout: entry.layout, size: size)
                LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: max(cols, 1)), spacing: 8) {
                    ForEach(shown) { tool in
                        Button(intent: OpenForgrToolIntent(toolId: tool.id)) {
                            VStack(spacing: 4) {
                                Text(tool.emoji)
                                    .font(.system(size: entry.layout == "big" ? 28 : entry.layout == "tiny" ? 18 : 22))
                                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                                    .background(tileColor(tool.color), in: RoundedRectangle(cornerRadius: entry.layout == "tiny" ? 10 : 14, style: .continuous))
                                if entry.layout != "tiny" {
                                    Text(tool.name)
                                        .font(.system(size: 11, weight: .medium))
                                        .lineLimit(1)
                                        .foregroundStyle(Color.white.opacity(0.72))
                                }
                            }
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel(tool.name)
                    }
                }
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
        .containerBackground(Color(red: 0.110, green: 0.110, blue: 0.118), for: .widget)
        .environment(\.colorScheme, .dark)
    }

    private var openLabel: some View {
        VStack(spacing: 2) {
            Text("Forgr").font(.system(size: 22, weight: .semibold))
            Text("Open").font(.system(size: 13, weight: .medium)).foregroundStyle(Color.white.opacity(0.6))
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color(red: 0.173, green: 0.173, blue: 0.180), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }

    private var emptyLabel: some View {
        Text("Pin tools in Forgr")
            .font(.system(size: 13, weight: .medium))
            .foregroundStyle(Color.white.opacity(0.6))
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
