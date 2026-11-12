// 识字：用 macOS 自带的 Vision 识别截图里的中文，每张图输出一行 JSON。
// 用法：wework-ocr 图1.png 图2.png ...
// 输出：{"file": 路径, "w": 宽, "h": 高, "lines": [{"t": 文字, "x": 左, "y": 上, "w": 宽, "h": 高, "c": 置信度}]}
// 坐标是像素，原点在左上角。不需要任何系统权限。
// 注意：编译出的程序名必须是英文（wework-ocr）。用中文名编译，签名标识是中文，Vision 会报 CoreML error -1。

import Foundation
import Vision
import ImageIO

if CommandLine.arguments.contains("--help") {
    print("Usage: wework-ocr image.png [...]; local macOS Vision OCR only")
    exit(0)
}

for path in CommandLine.arguments.dropFirst() {
    let url = URL(fileURLWithPath: path)
    let req = VNRecognizeTextRequest()
    req.recognitionLevel = .accurate
    req.recognitionLanguages = ["zh-Hans", "en-US"]
    do { try VNImageRequestHandler(url: url).perform([req]) } catch {
        FileHandle.standardError.write("识别失败：\(path) \(error)\n".data(using: .utf8)!)
        continue
    }
    guard let src = CGImageSourceCreateWithURL(url as CFURL, nil),
          let props = CGImageSourceCopyPropertiesAtIndex(src, 0, nil) as? [CFString: Any],
          let W = props[kCGImagePropertyPixelWidth] as? CGFloat,
          let H = props[kCGImagePropertyPixelHeight] as? CGFloat else {
        FileHandle.standardError.write("读不了图：\(path)\n".data(using: .utf8)!)
        continue
    }
    var lines: [[String: Any]] = []
    for ob in req.results ?? [] {
        guard let top = ob.topCandidates(1).first else { continue }
        let b = ob.boundingBox
        lines.append(["t": top.string, "c": (Double(top.confidence) * 100).rounded() / 100,
                      "x": Int(b.minX * W), "y": Int((1 - b.maxY) * H),
                      "w": Int(b.width * W), "h": Int(b.height * H)])
    }
    lines.sort { ($0["y"] as! Int, $0["x"] as! Int) < ($1["y"] as! Int, $1["x"] as! Int) }
    let out: [String: Any] = ["file": path, "w": Int(W), "h": Int(H), "lines": lines]
    if let d = try? JSONSerialization.data(withJSONObject: out), let s = String(data: d, encoding: .utf8) { print(s) }
}
