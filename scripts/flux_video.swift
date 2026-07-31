#!/usr/bin/env swift

import AVFoundation
import CoreGraphics
import Foundation
import ImageIO

enum FluxError: Error, CustomStringConvertible {
    case usage
    case message(String)

    var description: String {
        switch self {
        case .usage:
            return "usage: flux_video.swift generate <input-image> <output.mp4> <width> <height> <duration> <fps> <seed> | finish <input.mp4> <output.mp4>"
        case .message(let value):
            return value
        }
    }
}

func waitForWriter(_ writer: AVAssetWriter) throws {
    let semaphore = DispatchSemaphore(value: 0)
    writer.finishWriting { semaphore.signal() }
    semaphore.wait()
    if writer.status != .completed {
        throw writer.error ?? FluxError.message("AVAssetWriter did not complete")
    }
}

func generate(arguments: [String]) throws {
    guard arguments.count == 9,
          let width = Int(arguments[4]),
          let height = Int(arguments[5]),
          let duration = Double(arguments[6]),
          let fps = Int(arguments[7]),
          let seed = UInt64(arguments[8]),
          width > 0, height > 0, duration > 0, fps > 0 else {
        throw FluxError.usage
    }

    let inputURL = URL(fileURLWithPath: arguments[2])
    let outputURL = URL(fileURLWithPath: arguments[3])
    guard let source = CGImageSourceCreateWithURL(inputURL as CFURL, nil),
          let image = CGImageSourceCreateImageAtIndex(source, 0, nil) else {
        throw FluxError.message("could not decode grounded BELOW image")
    }

    try? FileManager.default.removeItem(at: outputURL)
    let writer = try AVAssetWriter(outputURL: outputURL, fileType: .mp4)
    let settings: [String: Any] = [
        AVVideoCodecKey: AVVideoCodecType.h264,
        AVVideoWidthKey: width,
        AVVideoHeightKey: height,
        AVVideoCompressionPropertiesKey: [
            AVVideoAverageBitRateKey: max(1_200_000, width * height * 8),
            AVVideoExpectedSourceFrameRateKey: fps,
            AVVideoMaxKeyFrameIntervalKey: fps,
            AVVideoAllowFrameReorderingKey: false,
            AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel,
        ],
    ]
    let input = AVAssetWriterInput(mediaType: .video, outputSettings: settings)
    input.expectsMediaDataInRealTime = false
    let adaptor = AVAssetWriterInputPixelBufferAdaptor(
        assetWriterInput: input,
        sourcePixelBufferAttributes: [
            kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
            kCVPixelBufferWidthKey as String: width,
            kCVPixelBufferHeightKey as String: height,
        ]
    )
    guard writer.canAdd(input) else { throw FluxError.message("cannot add Flux video input") }
    writer.add(input)
    guard writer.startWriting() else { throw writer.error ?? FluxError.message("cannot start Flux writer") }
    writer.startSession(atSourceTime: .zero)

    let frameCount = max(1, Int((duration * Double(fps)).rounded()))
    let sourceRatio = CGFloat(image.width) / CGFloat(image.height)
    let targetRatio = CGFloat(width) / CGFloat(height)
    let seedUnit = CGFloat(seed % 10_000) / 10_000
    let direction: CGFloat = (seed & 1) == 0 ? 1 : -1
    let baseProfile = Int(seed % 3)
    let cameraZoomProfiles: [[CGFloat]] = [
        [1.025, 1.085, 1.055, 1.12], // monumental push
        [1.08, 1.035, 1.10, 1.055],  // aerial reveal
        [1.045, 1.105, 1.065, 1.13], // horizon orbit
    ]
    let cameraXProfiles: [[CGFloat]] = [
        [-0.18, 0.12, -0.08, 0.16],
        [0.20, -0.14, 0.11, -0.18],
        [-0.08, 0.19, -0.17, 0.06],
    ]
    let cameraYProfiles: [[CGFloat]] = [
        [0.04, -0.08, 0.035, -0.055],
        [-0.09, 0.055, -0.035, 0.075],
        [0.065, -0.025, -0.085, 0.02],
    ]
    func anchored(_ values: [CGFloat], _ phase: CGFloat) -> CGFloat {
        let position = min(2.999_999, max(0, phase * 3))
        let segment = Int(floor(position))
        let local = position - CGFloat(segment)
        let eased = local * local * (3 - 2 * local)
        return values[segment] + (values[segment + 1] - values[segment]) * eased
    }

    func cameraRect(profile: Int, phase: CGFloat) -> CGRect {
        let zoom = anchored(cameraZoomProfiles[profile], phase)
        var drawWidth: CGFloat
        var drawHeight: CGFloat
        if sourceRatio > targetRatio {
            drawHeight = CGFloat(height) * zoom
            drawWidth = drawHeight * sourceRatio
        } else {
            drawWidth = CGFloat(width) * zoom
            drawHeight = drawWidth / sourceRatio
        }
        let overflowX = max(0, drawWidth - CGFloat(width))
        let overflowY = max(0, drawHeight - CGFloat(height))
        let xValues = cameraXProfiles[profile].map { $0 * direction }
        let panX = anchored(xValues, phase) * (overflowX + CGFloat(width) * 0.018) * (0.75 + seedUnit * 0.25)
        let panY = anchored(cameraYProfiles[profile], phase) * (overflowY + CGFloat(height) * 0.018)
        return CGRect(
            x: (CGFloat(width) - drawWidth) / 2 - panX,
            y: (CGFloat(height) - drawHeight) / 2 - panY,
            width: drawWidth,
            height: drawHeight
        )
    }

    for frame in 0..<frameCount {
        while !input.isReadyForMoreMediaData { Thread.sleep(forTimeInterval: 0.001) }
        guard let pool = adaptor.pixelBufferPool else { throw FluxError.message("missing pixel buffer pool") }
        var optionalBuffer: CVPixelBuffer?
        guard CVPixelBufferPoolCreatePixelBuffer(nil, pool, &optionalBuffer) == kCVReturnSuccess,
              let pixelBuffer = optionalBuffer else {
            throw FluxError.message("could not allocate video frame")
        }

        CVPixelBufferLockBaseAddress(pixelBuffer, [])
        defer { CVPixelBufferUnlockBaseAddress(pixelBuffer, []) }
        guard let base = CVPixelBufferGetBaseAddress(pixelBuffer),
              let context = CGContext(
                data: base,
                width: width,
                height: height,
                bitsPerComponent: 8,
                bytesPerRow: CVPixelBufferGetBytesPerRow(pixelBuffer),
                space: CGColorSpaceCreateDeviceRGB(),
                bitmapInfo: CGImageAlphaInfo.premultipliedFirst.rawValue | CGBitmapInfo.byteOrder32Little.rawValue
              ) else {
            throw FluxError.message("could not create video frame context")
        }

        let phase = frameCount == 1 ? 0 : CGFloat(frame) / CGFloat(frameCount - 1)
        let shotPosition = min(2.999_999, phase * 3)
        let shot = min(2, Int(floor(shotPosition)))
        let shotPhase = shotPosition - CGFloat(shot)
        let profile = (baseProfile + shot) % 3
        let rect = cameraRect(profile: profile, phase: shotPhase)
        context.interpolationQuality = .high
        context.draw(image, in: rect)

        // Flux splice: each third is a real shot. The last 16% dissolves into
        // the next camera grammar without introducing a new identity frame.
        if shot < 2 && shotPhase > 0.84 {
            let transition = (shotPhase - 0.84) / 0.16
            let easedTransition = transition * transition * (3 - 2 * transition)
            let nextProfile = (baseProfile + shot + 1) % 3
            let nextRect = cameraRect(profile: nextProfile, phase: transition * 0.12)
            context.saveGState()
            context.setAlpha(easedTransition)
            context.draw(image, in: nextRect)
            context.restoreGState()
        }

        // A subtle multi-plane redraw separates architecture from sky/water.
        let parallax = sin(shotPhase * .pi) * CGFloat(width) * 0.0035
        context.saveGState()
        context.clip(to: CGRect(
            x: 0,
            y: CGFloat(height) * 0.34,
            width: CGFloat(width),
            height: CGFloat(height) * 0.38
        ))
        context.setAlpha(0.30)
        context.draw(image, in: rect.offsetBy(dx: parallax * direction, dy: CGFloat(height) * 0.0015))
        context.restoreGState()

        // Flux tempo: the reflected water lags the camera by the 0.21 echo.
        context.saveGState()
        context.clip(to: CGRect(x: 0, y: 0, width: width, height: Int(CGFloat(height) * 0.46)))
        context.setAlpha(0.075)
        let echo = sin((phase - 0.21) * .pi * 2) * CGFloat(width) * 0.0035
        context.draw(image, in: rect.offsetBy(dx: echo, dy: -CGFloat(height) * 0.004))
        context.restoreGState()

        // Sparse atmospheric motes provide scale without overwhelming the
        // selected SSD-1B composition.
        for mote in 0..<18 {
            let key = UInt64(mote + 1) &* 1_103_515_245 &+ seed
            let xBase = CGFloat(key % 10_000) / 10_000
            let yBase = CGFloat((key / 97) % 10_000) / 10_000
            let drift = sin(phase * .pi * 2 + CGFloat(mote)) * CGFloat(width) * 0.002
            let radius = 0.45 + CGFloat((key / 17) % 100) / 180
            let alpha = 0.035 + 0.055 * (0.5 + 0.5 * sin(phase * .pi * 4 + CGFloat(mote) * 0.77))
            context.setFillColor(red: 1, green: 0.72, blue: 0.42, alpha: alpha)
            context.fillEllipse(in: CGRect(
                x: xBase * CGFloat(width) + drift,
                y: CGFloat(height) * (0.58 + yBase * 0.36),
                width: radius,
                height: radius
            ))
        }

        // Flux render: a restrained teal/copper grade with a breathing horizon.
        let breath = 0.5 + 0.5 * sin(phase * .pi * 2)
        if let grade = CGGradient(
            colorsSpace: CGColorSpaceCreateDeviceRGB(),
            colors: [
                CGColor(red: 0.02, green: 0.11, blue: 0.16, alpha: 0.12),
                CGColor(red: 0.36, green: 0.08, blue: 0.015, alpha: 0.11 + 0.025 * breath),
            ] as CFArray,
            locations: [0, 1]
        ) {
            context.drawLinearGradient(
                grade,
                start: CGPoint(x: CGFloat(width) / 2, y: CGFloat(height)),
                end: CGPoint(x: CGFloat(width) / 2, y: 0),
                options: []
            )
        }

        // A deterministic central bloom makes the source beam feel alive.
        if let bloom = CGGradient(
            colorsSpace: CGColorSpaceCreateDeviceRGB(),
            colors: [
                CGColor(red: 1, green: 0.63, blue: 0.26, alpha: 0.18 + 0.08 * breath),
                CGColor(red: 1, green: 0.4, blue: 0.08, alpha: 0),
            ] as CFArray,
            locations: [0, 1]
        ) {
            let center = CGPoint(
                x: CGFloat(width) * (0.5 + 0.006 * sin(phase * .pi * 2)),
                y: CGFloat(height) * 0.47
            )
            context.drawRadialGradient(
                bloom,
                startCenter: center,
                startRadius: 0,
                endCenter: center,
                endRadius: CGFloat(width) * 0.18,
                options: [.drawsAfterEndLocation]
            )
        }

        // Sub-pixel water shimmer follows the four causal anchors.
        context.setLineWidth(1)
        for line in 0..<12 {
            let unit = CGFloat(line) / 11
            let y = CGFloat(height) * (0.06 + unit * 0.36)
            let wave = sin(phase * .pi * 4 + CGFloat(line) * 1.73 + seedUnit * 6)
            let halfWidth = CGFloat(width) * (0.025 + (1 - unit) * 0.08) * (0.7 + 0.3 * wave)
            let alpha = 0.025 + 0.035 * (0.5 + 0.5 * wave)
            context.setStrokeColor(red: 1, green: 0.48, blue: 0.18, alpha: alpha)
            context.move(to: CGPoint(x: CGFloat(width) / 2 - halfWidth, y: y))
            context.addLine(to: CGPoint(x: CGFloat(width) / 2 + halfWidth, y: y))
            context.strokePath()
        }

        // Flux splice finish: soft vignette keeps the city as the identity lock.
        if let vignette = CGGradient(
            colorsSpace: CGColorSpaceCreateDeviceRGB(),
            colors: [
                CGColor(red: 0, green: 0, blue: 0, alpha: 0),
                CGColor(red: 0, green: 0.015, blue: 0.03, alpha: 0.32),
            ] as CFArray,
            locations: [0.58, 1]
        ) {
            let center = CGPoint(x: CGFloat(width) / 2, y: CGFloat(height) * 0.52)
            context.drawRadialGradient(
                vignette,
                startCenter: center,
                startRadius: CGFloat(width) * 0.18,
                endCenter: center,
                endRadius: CGFloat(width) * 0.72,
                options: [.drawsAfterEndLocation]
            )
        }

        let time = CMTime(value: CMTimeValue(frame), timescale: CMTimeScale(fps))
        guard adaptor.append(pixelBuffer, withPresentationTime: time) else {
            throw writer.error ?? FluxError.message("could not append Flux frame")
        }
    }
    input.markAsFinished()
    try waitForWriter(writer)
}

func finish(arguments: [String]) throws {
    guard arguments.count == 4 else { throw FluxError.usage }
    let sourceURL = URL(fileURLWithPath: arguments[2])
    let outputURL = URL(fileURLWithPath: arguments[3])
    try? FileManager.default.removeItem(at: outputURL)
    let asset = AVURLAsset(url: sourceURL)
    let composition = AVMutableComposition()
    guard let sourceTrack = asset.tracks(withMediaType: .video).first,
          let track = composition.addMutableTrack(
            withMediaType: .video,
            preferredTrackID: kCMPersistentTrackID_Invalid
          ) else {
        throw FluxError.message("motion artifact contains no video track")
    }
    try track.insertTimeRange(CMTimeRange(start: .zero, duration: asset.duration), of: sourceTrack, at: .zero)
    track.preferredTransform = sourceTrack.preferredTransform
    guard let exporter = AVAssetExportSession(asset: composition, presetName: AVAssetExportPresetPassthrough) else {
        throw FluxError.message("could not create Flux splice exporter")
    }
    exporter.outputURL = outputURL
    exporter.outputFileType = .mp4
    exporter.metadata = []
    let semaphore = DispatchSemaphore(value: 0)
    exporter.exportAsynchronously { semaphore.signal() }
    semaphore.wait()
    guard exporter.status == .completed else {
        throw exporter.error ?? FluxError.message("Flux splice export failed")
    }
}

do {
    let arguments = CommandLine.arguments
    guard arguments.count >= 2 else { throw FluxError.usage }
    if arguments[1] == "generate" {
        try generate(arguments: arguments)
    } else if arguments[1] == "finish" {
        try finish(arguments: arguments)
    } else {
        throw FluxError.usage
    }
} catch {
    FileHandle.standardError.write(Data("flux_video: \(error)\n".utf8))
    exit(1)
}
