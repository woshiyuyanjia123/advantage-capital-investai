// 生成 1024×1024 应用图标（深蓝圆角方块 + 「A /」标识），electron-builder 由它派生 icns / ico。
import AppKit
let size: CGFloat = 1024
let img = NSImage(size: NSSize(width: size, height: size))
img.lockFocus()
let rect = NSRect(x: 64, y: 64, width: size - 128, height: size - 128)
let path = NSBezierPath(roundedRect: rect, xRadius: 200, yRadius: 200)
NSGradient(colors: [NSColor(red: 0.09, green: 0.19, blue: 0.38, alpha: 1), NSColor(red: 0.04, green: 0.07, blue: 0.13, alpha: 1)])!.draw(in: path, angle: -60)
NSColor(red: 0.23, green: 0.51, blue: 0.96, alpha: 0.55).setStroke(); path.lineWidth = 10; path.stroke()
let font = NSFontManager.shared.convert(NSFont.systemFont(ofSize: 430, weight: .heavy), toHaveTrait: .italicFontMask)
let attrs: [NSAttributedString.Key: Any] = [.font: font, .foregroundColor: NSColor(red: 0.30, green: 0.55, blue: 0.97, alpha: 1)]
let text = NSAttributedString(string: "A/", attributes: attrs)
let ts = text.size()
text.draw(at: NSPoint(x: (size - ts.width) / 2, y: (size - ts.height) / 2 - 10))
img.unlockFocus()
let rep = NSBitmapImageRep(data: img.tiffRepresentation!)!
try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: CommandLine.arguments[1]))
