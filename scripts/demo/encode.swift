// 把录屏帧（不定时间间隔）与分段旁白合成为 H.264 + AAC 的 MP4，只用 macOS 自带 AVFoundation。
//   swift encode.swift <帧清单> <音频清单|-> <输出.mp4>
//   帧清单每行：<jpg 路径>\t<开始秒>；最后一行：END\t<总时长秒>
//   音频清单每行：<音频路径>\t<开始秒>
import AVFoundation
import AppKit

func lines(_ path: String) -> [(String, Double)] {
  (try? String(contentsOfFile: path, encoding: .utf8))?.split(separator: "\n").compactMap { l in
    let p = l.split(separator: "\t"); return p.count == 2 ? (String(p[0]), Double(p[1]) ?? 0) : nil
  } ?? []
}
let args = CommandLine.arguments
guard args.count == 4 else { print("用法：swift encode.swift <帧清单> <音频清单|-> <输出.mp4>"); exit(2) }
let frameList = lines(args[1]), audioList = args[2] == "-" ? [] : lines(args[2]), out = URL(fileURLWithPath: args[3])
let total = frameList.last(where: { $0.0 == "END" })?.1 ?? 0
let frames = frameList.filter { $0.0 != "END" }
guard let first = NSImage(contentsOfFile: frames[0].0), let cg0 = first.cgImage(forProposedRect: nil, context: nil, hints: nil) else { print("无法读取首帧"); exit(1) }
let W = cg0.width, H = cg0.height
let scale: CMTimeScale = 600
let videoOnly = out.deletingPathExtension().appendingPathExtension("video.mp4")
try? FileManager.default.removeItem(at: videoOnly)
let writer = try AVAssetWriter(outputURL: videoOnly, fileType: .mp4)
let input = AVAssetWriterInput(mediaType: .video, outputSettings: [AVVideoCodecKey: AVVideoCodecType.h264, AVVideoWidthKey: W, AVVideoHeightKey: H,
  AVVideoCompressionPropertiesKey: [AVVideoAverageBitRateKey: 5_000_000, AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel, AVVideoMaxKeyFrameIntervalKey: 60]])
let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: input, sourcePixelBufferAttributes: [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32ARGB, kCVPixelBufferWidthKey as String: W, kCVPixelBufferHeightKey as String: H])
writer.add(input)
writer.startWriting()
writer.startSession(atSourceTime: .zero)
var lastT: Int64 = -1
var lastBuf: CVPixelBuffer? = nil
func append(_ buf: CVPixelBuffer, _ seconds: Double) {
  var t = Int64(seconds * Double(scale))
  if t <= lastT { t = lastT + 1 }
  while !input.isReadyForMoreMediaData { Thread.sleep(forTimeInterval: 0.002) }
  adaptor.append(buf, withPresentationTime: CMTime(value: t, timescale: scale))
  lastT = t
}
for (path, start) in frames {
  autoreleasepool {
    guard let img = NSImage(contentsOfFile: path), let cg = img.cgImage(forProposedRect: nil, context: nil, hints: nil) else { return }
    var pb: CVPixelBuffer?
    CVPixelBufferPoolCreatePixelBuffer(nil, adaptor.pixelBufferPool!, &pb)
    guard let buf = pb else { return }
    CVPixelBufferLockBaseAddress(buf, [])
    let ctx = CGContext(data: CVPixelBufferGetBaseAddress(buf), width: W, height: H, bitsPerComponent: 8, bytesPerRow: CVPixelBufferGetBytesPerRow(buf), space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.noneSkipFirst.rawValue)!
    ctx.draw(cg, in: CGRect(x: 0, y: 0, width: W, height: H))
    CVPixelBufferUnlockBaseAddress(buf, [])
    append(buf, start)
    lastBuf = buf
  }
}
if let b = lastBuf { append(b, max(total - 0.05, Double(lastT) / Double(scale) + 0.05)) }
input.markAsFinished()
writer.endSession(atSourceTime: CMTime(seconds: total, preferredTimescale: scale))
let done = DispatchSemaphore(value: 0)
writer.finishWriting { done.signal() }
done.wait()
if writer.status != .completed { print("视频写入失败：\(String(describing: writer.error))"); exit(1) }
try? FileManager.default.removeItem(at: out)
let comp = AVMutableComposition()
let vAsset = AVURLAsset(url: videoOnly)
let cv = comp.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid)!
try cv.insertTimeRange(CMTimeRange(start: .zero, duration: vAsset.duration), of: vAsset.tracks(withMediaType: .video)[0], at: .zero)
if !audioList.isEmpty {
  let ca = comp.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid)!
  for (path, start) in audioList {
    let a = AVURLAsset(url: URL(fileURLWithPath: path))
    guard let tr = a.tracks(withMediaType: .audio).first else { continue }
    let at = CMTime(seconds: start, preferredTimescale: scale)
    let dur = CMTimeMinimum(a.duration, CMTimeSubtract(vAsset.duration, at))
    if dur.seconds > 0 { try ca.insertTimeRange(CMTimeRange(start: .zero, duration: dur), of: tr, at: at) }
  }
}
let exp = AVAssetExportSession(asset: comp, presetName: AVAssetExportPresetHighestQuality)!
exp.outputURL = out
exp.outputFileType = .mp4
let d2 = DispatchSemaphore(value: 0)
exp.exportAsynchronously { d2.signal() }
d2.wait()
try? FileManager.default.removeItem(at: videoOnly)
if exp.status != .completed { print("合成失败：\(String(describing: exp.error))"); exit(1) }
print("完成：\(out.path)  \(W)x\(H)  \(frames.count) 帧  \(String(format: "%.1f", total)) 秒")
