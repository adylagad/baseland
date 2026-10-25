import SwiftUI
import UIKit

/// Design tokens. The source of truth for color and type across the app and
/// the Live Activity (see docs/IDEA.md §5): calm surface, loud state, money in
/// monospace, GHOST impossible to miss.
public enum Theme {
    // MARK: Surfaces and ink (adapt to light/dark)

    public static let paper = dynamic(light: 0xF5F3EE, dark: 0x0E0F12)
    public static let surface = dynamic(light: 0xFFFFFF, dark: 0x17191E)
    public static let surface2 = dynamic(light: 0xEDEAE3, dark: 0x1F2228)
    public static let line = dynamic(light: 0xE2DFD7, dark: 0x2A2D34)
    public static let ink = dynamic(light: 0x14161A, dark: 0xF2F1EC)
    public static let inkSoft = dynamic(light: 0x4A4F59, dark: 0xB9BCC4)
    public static let inkMuted = dynamic(light: 0x8A8F99, dark: 0x7D828C)

    // MARK: Stage colors (identical in light and dark; tuned for the black Island)

    public enum Stage {
        public static let idle = hex(0x8E96A3)
        public static let watching = hex(0x3D7BFF)
        public static let deciding = hex(0xFFB224)
        public static let awaiting = hex(0xFF6A3D)
        public static let done = hex(0x2BD07F)
        public static let stopped = hex(0xFF4D5E)
        public static let expired = hex(0x6B7280)
    }

    /// GHOST's own color. Never used for anything else.
    public static let ghost = hex(0xB49CFF)

    // MARK: Type

    /// Money and any number a user might compare. Always monospaced.
    public static func money(_ size: CGFloat, weight: Font.Weight = .semibold) -> Font {
        .system(size: size, weight: weight, design: .monospaced)
    }

    public static func label(_ size: CGFloat, weight: Font.Weight = .medium) -> Font {
        .system(size: size, weight: weight)
    }

    // MARK: Helpers

    static func hex(_ value: UInt32) -> Color {
        Color(uiColor: uiHex(value))
    }

    static func dynamic(light: UInt32, dark: UInt32) -> Color {
        Color(uiColor: UIColor { $0.userInterfaceStyle == .dark ? uiHex(dark) : uiHex(light) })
    }

    static func uiHex(_ value: UInt32) -> UIColor {
        UIColor(
            red: CGFloat((value >> 16) & 0xFF) / 255,
            green: CGFloat((value >> 8) & 0xFF) / 255,
            blue: CGFloat(value & 0xFF) / 255,
            alpha: 1
        )
    }
}

public enum Format {
    public static func usd(_ value: Double, signed: Bool = false) -> String {
        let style = FloatingPointFormatStyle<Double>.Currency(code: "USD")
            .precision(.fractionLength(value.magnitude < 10 ? 2 : (value.magnitude < 1000 ? 2 : 0)))
        let text = value.magnitude.formatted(style)
        guard signed else { return value < 0 ? "-" + text : text }
        return (value < 0 ? "−" : "+") + text
    }

    public static func price(_ value: Double) -> String {
        value.formatted(.number.precision(.fractionLength(value < 10 ? 4 : 2)).grouping(.automatic))
    }
}
