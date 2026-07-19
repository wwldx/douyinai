import Foundation
import Vision

guard CommandLine.arguments.count == 3 else {
  FileHandle.standardError.write(Data("用法：swift scripts/verify-demo-qr.swift <PNG> <预期内容>\n".utf8))
  exit(2)
}

let imageUrl = URL(fileURLWithPath: CommandLine.arguments[1])
let expectedPayload = CommandLine.arguments[2]
let request = VNDetectBarcodesRequest()
request.symbologies = [.qr]

try VNImageRequestHandler(url: imageUrl, options: [:]).perform([request])

let decodedPayloads = (request.results ?? []).compactMap(\.payloadStringValue)
guard decodedPayloads.contains(expectedPayload) else {
  FileHandle.standardError.write(
    Data("二维码校验失败，实际结果：\(decodedPayloads)\n".utf8)
  )
  exit(1)
}

print("二维码校验通过：\(expectedPayload)")
