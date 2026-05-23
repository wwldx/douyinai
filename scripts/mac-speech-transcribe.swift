import Foundation
import Speech

struct SpeechResult: Encodable {
  let ok: Bool
  let transcript: String?
  let error: String?
  let code: String?
}

func emit(_ result: SpeechResult) {
  let encoder = JSONEncoder()
  encoder.outputFormatting = [.withoutEscapingSlashes]
  if let data = try? encoder.encode(result), let text = String(data: data, encoding: .utf8) {
    print(text)
  } else {
    print("{\"ok\":false,\"error\":\"JSON encode failed\",\"code\":\"json_encode_failed\"}")
  }
}

func fail(_ message: String, code: String) -> Never {
  emit(SpeechResult(ok: false, transcript: nil, error: message, code: code))
  exit(1)
}

let args = CommandLine.arguments
guard args.count >= 2 else {
  fail("Usage: swift scripts/mac-speech-transcribe.swift <audio.wav> [locale] [--on-device]", code: "usage")
}

let audioPath = args[1]
let localeIdentifier = args.count >= 3 && !args[2].hasPrefix("--") ? args[2] : "zh-CN"
let onDeviceOnly = args.contains("--on-device")
let audioURL = URL(fileURLWithPath: audioPath)

guard FileManager.default.fileExists(atPath: audioURL.path) else {
  fail("Audio file does not exist.", code: "audio_file_missing")
}

guard let recognizer = SFSpeechRecognizer(locale: Locale(identifier: localeIdentifier)) else {
  fail("当前 macOS Speech 不支持这个语言：\(localeIdentifier)。", code: "locale_not_supported")
}

let authSemaphore = DispatchSemaphore(value: 0)
var authStatus = SFSpeechRecognizerAuthorizationStatus.notDetermined
SFSpeechRecognizer.requestAuthorization { status in
  authStatus = status
  authSemaphore.signal()
}

if authSemaphore.wait(timeout: .now() + 15) == .timedOut {
  fail("等待 macOS 语音识别授权超时，请在系统设置里允许终端或 Codex 使用语音识别。", code: "authorization_timeout")
}

switch authStatus {
case .authorized:
  break
case .denied:
  fail("macOS 语音识别权限被拒绝，请在系统设置 -> 隐私与安全性 -> 语音识别中允许当前终端。", code: "authorization_denied")
case .restricted:
  fail("macOS 语音识别当前被系统限制。", code: "authorization_restricted")
case .notDetermined:
  fail("macOS 语音识别尚未完成授权。", code: "authorization_not_determined")
@unknown default:
  fail("macOS 语音识别授权状态未知。", code: "authorization_unknown")
}

guard recognizer.isAvailable else {
  fail("macOS Speech 服务当前不可用。", code: "recognizer_unavailable")
}

let request = SFSpeechURLRecognitionRequest(url: audioURL)
request.shouldReportPartialResults = false

if #available(macOS 10.15, *) {
  if onDeviceOnly {
    guard recognizer.supportsOnDeviceRecognition else {
      fail("当前语言或系统不支持设备端语音识别。可在 .env.local 设置 MAC_SPEECH_ON_DEVICE_ONLY=false 改用系统在线识别。", code: "on_device_not_supported")
    }
    request.requiresOnDeviceRecognition = true
  }
}

let recognitionSemaphore = DispatchSemaphore(value: 0)
let lock = NSLock()
var bestTranscript = ""
var finalTranscript = ""
var recognitionError: Error?
var isFinished = false
var resultVersion = 0
let noResultTimeoutSeconds: Double = 12
let partialSettleSeconds: Double = 1.4

func finishOnce() {
  lock.lock()
  defer { lock.unlock() }
  if isFinished { return }
  isFinished = true
  recognitionSemaphore.signal()
}

func trimmed(_ text: String) -> String {
  return text.trimmingCharacters(in: .whitespacesAndNewlines)
}

func schedulePartialFinish(version: Int) {
  DispatchQueue.global().asyncAfter(deadline: .now() + partialSettleSeconds) {
    var shouldFinish = false

    lock.lock()
    if !isFinished && resultVersion == version && !trimmed(bestTranscript).isEmpty {
      finalTranscript = bestTranscript
      shouldFinish = true
    }
    lock.unlock()

    if shouldFinish {
      finishOnce()
    }
  }
}

let task = recognizer.recognitionTask(with: request) { result, error in
  if let result = result {
    let transcript = result.bestTranscription.formattedString
    lock.lock()
    bestTranscript = transcript
    resultVersion += 1
    let currentVersion = resultVersion
    lock.unlock()

    if result.isFinal {
      lock.lock()
      finalTranscript = transcript
      lock.unlock()
      finishOnce()
    } else if !trimmed(transcript).isEmpty {
      schedulePartialFinish(version: currentVersion)
    }
  }

  if let error = error {
    recognitionError = error
    finishOnce()
  }
}

if recognitionSemaphore.wait(timeout: .now() + noResultTimeoutSeconds) == .timedOut {
  task.cancel()
  if !trimmed(bestTranscript).isEmpty {
    emit(SpeechResult(ok: true, transcript: bestTranscript, error: nil, code: nil))
    exit(0)
  }
  fail("macOS Speech 长时间没有返回识别文本，已超时。", code: "recognition_timeout")
}

let transcript = finalTranscript.isEmpty ? bestTranscript : finalTranscript
if !trimmed(transcript).isEmpty {
  emit(SpeechResult(ok: true, transcript: transcript, error: nil, code: nil))
  exit(0)
}

if let recognitionError = recognitionError {
  fail("macOS Speech 转写失败：\(recognitionError.localizedDescription)", code: "recognition_failed")
}

fail("没有识别到有效语音，请靠近麦克风再试一次。", code: "empty_transcript")
