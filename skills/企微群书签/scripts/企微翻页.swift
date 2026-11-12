// 企微翻页：只做三件事——在企微里打开置顶的那个群、在聊天区往上翻一段、把鼠标放回原处。
// 只发鼠标点击和滚动，不发任何键盘按键：键盘一旦落进聊天输入框，回车就会把字发出去
// 不可添加键盘/粘贴事件，也不可点击消息内容或输入框。
// 不截图、不读内容。截图由 抓屏.sh 用系统自带的 screencapture 做。
// 需要「系统设置 → 隐私与安全性 → 辅助功能」里打开「企微翻页」；要总结的群必须在企微里置顶。
//
// 用法（由 抓屏.sh 通过 open -g -W 调用，结果写到 翻页结果.json）：
//   check      只检查辅助功能权限，没有就弹系统授权框
//   open       点「消息」→ 会话列表滚到顶 → 点第一行（置顶的群）→ 聊天滚到最新
//   up <点数>  在聊天区往上翻这么多点
//   restore    把鼠标放回 open 之前的位置

import Cocoa
import ApplicationServices

let wwBundle = "com.tencent.WeWorkMac"
let supportDir = ProcessInfo.processInfo.environment["WEWORK_BOOKMARK_SUPPORT"] ?? (NSHomeDirectory() as NSString).appendingPathComponent("Library/Application Support/企微群书签")
let resultPath = supportDir + "/翻页结果.json"
let scenePath = supportDir + "/翻页现场.json"

// 企微窗口里的固定位置（窗口左上角为原点，单位：点）。企微改版后要重量。
let msgTab = CGPoint(x: 30, y: 95)        // 左栏「消息」
let firstRow = CGPoint(x: 183, y: 95)     // 会话列表第一行（置顶的群）
let listCenter = CGPoint(x: 183, y: 400)  // 会话列表中间，用来把列表滚到顶
let chatLeft: CGFloat = 310               // 聊天区左边界
let headerH: CGFloat = 60                 // 聊天区顶部群名栏
let inputH: CGFloat = 170                 // 聊天区底部输入框

func finish(_ ok: Bool, _ msg: String, _ extra: [String: Any] = [:]) -> Never {
    var d = extra
    d["ok"] = ok
    d["msg"] = msg
    d["time"] = ISO8601DateFormatter().string(from: Date())
    if let data = try? JSONSerialization.data(withJSONObject: d, options: [.prettyPrinted, .sortedKeys]) {
        try? data.write(to: URL(fileURLWithPath: resultPath))
    }
    exit(ok ? 0 : 1)
}

func wwWindow() -> (id: Int, rect: CGRect)? {
    guard let app = NSRunningApplication.runningApplications(withBundleIdentifier: wwBundle).first,
          let list = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]]
    else { return nil }
    var best: (id: Int, rect: CGRect)? = nil
    for w in list {
        guard (w[kCGWindowOwnerPID as String] as? pid_t) == app.processIdentifier,
              (w[kCGWindowLayer as String] as? Int) == 0,
              let b = w[kCGWindowBounds as String] as? NSDictionary,
              let r = CGRect(dictionaryRepresentation: b as CFDictionary),
              let n = w[kCGWindowNumber as String] as? Int,
              r.width >= 600, r.height >= 400
        else { continue }
        if best == nil || r.width * r.height > best!.rect.width * best!.rect.height { best = (n, r) }
    }
    return best
}

func winInfo(_ w: (id: Int, rect: CGRect)) -> [String: Any] {
    ["window_id": w.id, "x": Int(w.rect.minX), "y": Int(w.rect.minY), "w": Int(w.rect.width), "h": Int(w.rect.height),
     "chat_left": Int(chatLeft)]
}

func post(_ e: CGEvent?) { e?.post(tap: .cghidEventTap) }

func move(_ p: CGPoint) {
    post(CGEvent(mouseEventSource: nil, mouseType: .mouseMoved, mouseCursorPosition: p, mouseButton: .left))
    usleep(80_000)
}

func click(_ p: CGPoint) {
    move(p)
    post(CGEvent(mouseEventSource: nil, mouseType: .leftMouseDown, mouseCursorPosition: p, mouseButton: .left))
    usleep(60_000)
    post(CGEvent(mouseEventSource: nil, mouseType: .leftMouseUp, mouseCursorPosition: p, mouseButton: .left))
    usleep(300_000)
}

func scroll(at p: CGPoint, points: Int) {
    move(p)
    let step: Int32 = points >= 0 ? 40 : -40
    for _ in 0..<max(1, abs(points) / 40) {
        post(CGEvent(scrollWheelEvent2Source: nil, units: .pixel, wheelCount: 1, wheel1: step, wheel2: 0, wheel3: 0))
        usleep(12_000)
    }
}

func at(_ r: CGRect, _ p: CGPoint) -> CGPoint { CGPoint(x: r.minX + p.x, y: r.minY + p.y) }

func chatCenter(_ r: CGRect) -> CGPoint {
    CGPoint(x: r.minX + chatLeft + (r.width - chatLeft) / 2,
            y: r.minY + headerH + (r.height - headerH - inputH) / 2)
}

let args = Array(CommandLine.arguments.dropFirst())
if args.contains("--help") || args.contains("-h") {
    print("Usage: pager check | open | up <points> | restore; mouse navigation and scrolling only")
    exit(0)
}
try? FileManager.default.createDirectory(atPath: supportDir, withIntermediateDirectories: true)
try? FileManager.default.removeItem(atPath: resultPath)

let prompt = [kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: true] as CFDictionary
guard AXIsProcessTrustedWithOptions(prompt) else {
    finish(false, "没有辅助功能权限：系统设置 → 隐私与安全性 → 辅助功能，打开「企微翻页」")
}

switch args.first ?? "" {
case "check":
    finish(true, "辅助功能权限正常")

case "open":
    guard let w = wwWindow() else { finish(false, "找不到企微窗口：企微没开、没登录，或窗口不在当前桌面") }
    let mouse = CGEvent(source: nil)?.location ?? .zero
    if let data = try? JSONSerialization.data(withJSONObject: ["mouse_x": mouse.x, "mouse_y": mouse.y]) {
        try? data.write(to: URL(fileURLWithPath: scenePath))
    }
    click(at(w.rect, msgTab))
    scroll(at: at(w.rect, listCenter), points: 20000)   // 会话列表滚到顶，置顶的群在第一行
    usleep(500_000)
    click(at(w.rect, firstRow))
    usleep(1_500_000)
    scroll(at: chatCenter(w.rect), points: -20000)      // 聊天滚到最新
    usleep(800_000)
    finish(true, "已点开会话列表第一行", winInfo(w))

case "up":
    let pts = Int(args.count >= 2 ? args[1] : "480") ?? 480
    guard let w = wwWindow() else { finish(false, "找不到企微窗口") }
    scroll(at: chatCenter(w.rect), points: pts)
    usleep(1_200_000)     // 等企微把更早的消息加载出来
    finish(true, "上翻 \(pts) 点", winInfo(w))

case "restore":
    if let data = FileManager.default.contents(atPath: scenePath),
       let d = try? JSONSerialization.jsonObject(with: data) as? [String: Double],
       let x = d["mouse_x"], let y = d["mouse_y"] {
        move(CGPoint(x: x, y: y))
    }
    finish(true, "鼠标已放回")

default:
    finish(false, "未知命令：\(args.joined(separator: " "))")
}
