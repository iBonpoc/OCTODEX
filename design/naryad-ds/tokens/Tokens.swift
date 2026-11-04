import SwiftUI

// Токены «Наряд» для SwiftUI. Источник правды: tokens/*.css. При изменении токена менять оба места.
// Шрифт: SF Pro (системный) с теми же ролями; размеры ниже это база для Dynamic Type через @ScaledMetric.

extension Color {
    init(hex: UInt32, alpha: Double = 1) {
        self.init(.sRGB,
                  red: Double((hex >> 16) & 0xFF) / 255,
                  green: Double((hex >> 8) & 0xFF) / 255,
                  blue: Double(hex & 0xFF) / 255,
                  opacity: alpha)
    }
}

enum NaryadTheme { case dark, light }

struct NaryadPalette {
    let page, bg, ink, mut, bd, acc, onAcc: Color
    let surf, surf2, inset, track: Color
    let ov: Color            // фон окон и шторок (материал + этот оттенок)

    static let dark = NaryadPalette(
        page: Color(hex: 0x181A1E), bg: Color(hex: 0x24272D), ink: Color(hex: 0xF2F3F5), mut: Color(hex: 0xCDD1DA),
        bd: Color.white.opacity(0.14), acc: Color(hex: 0xFBFF00), onAcc: Color(hex: 0x0B0C0F),
        surf: Color.white.opacity(0.07), surf2: Color.white.opacity(0.11), inset: Color.white.opacity(0.05), track: Color.white.opacity(0.12),
        ov: Color(hex: 0x262930, alpha: 0.72))

    static let light = NaryadPalette(
        page: Color(hex: 0xDDD9D2), bg: Color(hex: 0xEFEBE5), ink: Color(hex: 0x15161A), mut: Color(hex: 0x575C68),
        bd: Color(hex: 0x14161E, alpha: 0.10), acc: Color(hex: 0xFBFF00), onAcc: Color(hex: 0x0B0C0F),
        surf: Color.white.opacity(0.62), surf2: Color.white.opacity(0.85), inset: Color.white.opacity(0.55), track: Color(hex: 0x14161E, alpha: 0.09),
        ov: Color(hex: 0xFAF8F4, alpha: 0.78))
}

enum NaryadStatus: CaseIterable {
    case ok, info, warn, bad, neutral

    var fill: Color {
        switch self {
        case .ok: return Color(hex: 0x7CE08A)
        case .info: return Color(hex: 0x8FA2FF)
        case .warn: return Color(hex: 0xFF8A3D)
        case .bad: return Color(hex: 0xFF6B6B)
        case .neutral: return Color.clear
        }
    }
    /// Цвет текста статуса на поверхности темы (контраст не ниже 4.5:1)
    func text(_ theme: NaryadTheme) -> Color {
        switch (self, theme) {
        case (.ok, .dark): return Color(hex: 0x9CF0A8);   case (.ok, .light): return Color(hex: 0x176428)
        case (.info, .dark): return Color(hex: 0xC2CCFF); case (.info, .light): return Color(hex: 0x3647C4)
        case (.warn, .dark): return Color(hex: 0xFFB47E); case (.warn, .light): return Color(hex: 0x944600)
        case (.bad, .dark): return Color(hex: 0xFFAAAA);  case (.bad, .light): return Color(hex: 0xB4232A)
        case (.neutral, _): return Color.secondary
        }
    }
    var glyph: String { switch self { case .ok: return "✓"; case .info: return "●"; case .warn: return "▲"; case .bad: return "✕"; case .neutral: return "○" } }
    /// Текст на заливке всегда тёмный
    static let onFill = Color(hex: 0x0B0C0F)
}

enum NaryadSpace { static let s1: CGFloat = 4, s2: CGFloat = 8, s3: CGFloat = 12, s4: CGFloat = 16, s5: CGFloat = 20, s6: CGFloat = 24, s8: CGFloat = 32 }
enum NaryadRadius { static let card: CGFloat = 24, inner: CGFloat = 18, field: CGFloat = 12, sheet: CGFloat = 24 }
enum NaryadSize {
    static let controlSm: CGFloat = 28, controlMd: CGFloat = 32, controlLg: CGFloat = 40
    static let controlPhone: CGFloat = 36   // видимый размер кнопки на телефоне
    static let hitMin: CGFloat = 44         // зона нажатия, не меньше
    static let field: CGFloat = 34, fieldPhone: CGFloat = 44
    static let statusBar: CGFloat = 44, tabBar: CGFloat = 56, safeBottom: CGFloat = 34, fab: CGFloat = 48
    static let blur: CGFloat = 20, blurOverlay: CGFloat = 24
}
enum NaryadFont {
    static let display: CGFloat = 28, title: CGFloat = 20, heading: CGFloat = 15, body: CGFloat = 13, caption: CGFloat = 11.5, micro: CGFloat = 10.5
}
enum NaryadMotion {
    static let fast = 0.16, base = 0.22, slow = 0.35, chart = 0.9
    static let spring = Animation.timingCurve(0.3, 1.25, 0.5, 1, duration: 0.4)
    static let easeOut = Animation.timingCurve(0.2, 0.8, 0.2, 1, duration: 0.35)
}
