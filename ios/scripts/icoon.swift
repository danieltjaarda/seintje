// swift scripts/icoon.swift → Seintje/Assets.xcassets/AppIcon.appiconset/icoon.png
import AppKit
let n = 1024
let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: n, pixelsHigh: n, bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
let r = NSRect(x: 0, y: 0, width: n, height: n)
NSGradient(starting: NSColor(srgbRed: 1, green: 0.55, blue: 0.2, alpha: 1), ending: NSColor(srgbRed: 1, green: 0.27, blue: 0.35, alpha: 1))!.draw(in: r, angle: -60)
let cfg = NSImage.SymbolConfiguration(pointSize: 520, weight: .semibold).applying(.init(paletteColors: [.white]))
let bel = NSImage(systemSymbolName: "bell.fill", accessibilityDescription: nil)!.withSymbolConfiguration(cfg)!
let s = bel.size
bel.draw(in: NSRect(x: (CGFloat(n) - s.width) / 2, y: (CGFloat(n) - s.height) / 2 - 10, width: s.width, height: s.height))
// stip rechtsboven
NSColor.white.setFill()
NSBezierPath(ovalIn: NSRect(x: 650, y: 640, width: 170, height: 170)).fill()
NSGradient(starting: NSColor(srgbRed: 1, green: 0.85, blue: 0.3, alpha: 1), ending: NSColor(srgbRed: 1, green: 0.7, blue: 0.1, alpha: 1))!.draw(in: NSBezierPath(ovalIn: NSRect(x: 672, y: 662, width: 126, height: 126)), angle: -90)
NSGraphicsContext.current = nil
try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: CommandLine.arguments[1]))
