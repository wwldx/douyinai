import { useEffect, useRef, useState } from "react";
import { agentSessionHeaders } from "../lib/agentSession";
import Icon from "./Icon";

const MAX_RECORDING_MS = 10000;

function speechRecognitionConstructor() {
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

function canRecordAudio() {
  return Boolean(navigator.mediaDevices?.getUserMedia && window.MediaRecorder && window.FileReader);
}

function pickAudioMimeType() {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
  return candidates.find((mimeType) => window.MediaRecorder?.isTypeSupported?.(mimeType)) || "";
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result || "")), { once: true });
    reader.addEventListener("error", () => reject(new Error("录音读取失败")), { once: true });
    reader.readAsDataURL(blob);
  });
}

async function transcribeRecording(blob) {
  const response = await fetch("/api/transcribe-audio", {
    method: "POST",
    headers: { "content-type": "application/json", ...agentSessionHeaders() },
    body: JSON.stringify({
      audioDataUrl: await blobToDataUrl(blob),
      mimeType: blob.type || "audio/webm",
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || payload.detail || "语音转写失败");
  return String(payload.transcript || "").trim();
}

export default function SpeechInput({ disabled = false, iconOnly = false, className = "", onTranscript }) {
  const [phase, setPhase] = useState("idle");
  const [status, setStatus] = useState("");
  const recognitionRef = useRef(null);
  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const mountedRef = useRef(true);

  function clearTimer() {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = null;
  }

  function stopStream() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }

  function cleanup() {
    clearTimer();
    recognitionRef.current?.abort?.();
    recognitionRef.current = null;
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    recorderRef.current = null;
    stopStream();
  }

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      cleanup();
    };
  }, []);

  function finishTranscript(transcript) {
    const text = String(transcript || "").trim();
    if (!mountedRef.current) return;
    if (!text) {
      setStatus("没有听清，可以再说一次");
      setPhase("idle");
      return;
    }
    onTranscript(text);
    setStatus("已写入，可继续补充或修改");
    setPhase("idle");
  }

  async function startRecordingFallback() {
    if (!canRecordAudio()) {
      setStatus("当前浏览器不支持语音，请直接输入");
      setPhase("idle");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      if (!mountedRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      const mimeType = pickAudioMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      streamRef.current = stream;
      recorderRef.current = recorder;
      chunksRef.current = [];

      recorder.addEventListener("dataavailable", (event) => {
        if (event.data?.size) chunksRef.current.push(event.data);
      });
      recorder.addEventListener("stop", async () => {
        clearTimer();
        stopStream();
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        chunksRef.current = [];
        recorderRef.current = null;
        if (!mountedRef.current) return;
        if (blob.size < 1024) {
          setStatus("录音太短，可以再说一次");
          setPhase("idle");
          return;
        }
        setPhase("transcribing");
        setStatus("正在转写");
        try {
          finishTranscript(await transcribeRecording(blob));
        } catch (error) {
          if (!mountedRef.current) return;
          setStatus(`${error.message || "转写失败"}，可直接输入`);
          setPhase("idle");
        }
      }, { once: true });

      recorder.start();
      setPhase("recording");
      setStatus("正在录音");
      timerRef.current = window.setTimeout(() => {
        if (recorder.state === "recording") recorder.stop();
      }, MAX_RECORDING_MS);
    } catch (error) {
      const denied = error?.name === "NotAllowedError" || error?.name === "PermissionDeniedError";
      setStatus(denied ? "请允许麦克风权限，或直接输入" : "无法开始录音，可直接输入");
      setPhase("idle");
      stopStream();
    }
  }

  function startBrowserRecognition() {
    const Recognition = speechRecognitionConstructor();
    if (!Recognition) {
      startRecordingFallback();
      return;
    }

    const recognition = new Recognition();
    recognition.lang = "zh-CN";
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognitionRef.current = recognition;
    let finalText = "";
    let ignoreEnd = false;

    recognition.addEventListener("start", () => {
      if (!mountedRef.current) return;
      setPhase("listening");
      setStatus("正在听");
    });
    recognition.addEventListener("result", (event) => {
      let interimText = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const text = event.results[index][0]?.transcript?.trim() || "";
        if (event.results[index].isFinal) finalText += text;
        else interimText += text;
      }
      if (mountedRef.current && interimText) setStatus(`听到：${interimText}`);
    });
    recognition.addEventListener("end", () => {
      recognitionRef.current = null;
      if (!mountedRef.current || ignoreEnd) return;
      finishTranscript(finalText);
    });
    recognition.addEventListener("error", (event) => {
      ignoreEnd = true;
      recognitionRef.current = null;
      if (!mountedRef.current) return;
      if (["network", "service-not-allowed"].includes(event.error)) {
        setStatus("切换到录音转写");
        startRecordingFallback();
        return;
      }
      const denied = ["not-allowed", "audio-capture"].includes(event.error);
      setStatus(denied ? "请允许麦克风权限，或直接输入" : "没有听清，可以再说一次");
      setPhase("idle");
    });

    try {
      recognition.start();
    } catch {
      recognitionRef.current = null;
      startRecordingFallback();
    }
  }

  function handleClick() {
    if (phase === "listening") {
      recognitionRef.current?.stop?.();
      return;
    }
    if (phase === "recording") {
      if (recorderRef.current?.state === "recording") recorderRef.current.stop();
      return;
    }
    if (phase === "transcribing" || disabled) return;
    startBrowserRecognition();
  }

  const active = phase === "listening" || phase === "recording";
  const buttonLabel = phase === "transcribing" ? "转写中" : active ? "结束语音" : "语音输入";

  return (
    <div className={`speech-row ${iconOnly ? "speech-row-icononly" : ""} ${className}`}>
      <button
        className={`speech-btn ${active ? "is-live" : ""}`}
        type="button"
        onClick={handleClick}
        disabled={disabled || phase === "transcribing"}
        aria-label={buttonLabel}
        title={buttonLabel}
      >
        <Icon name="mic" size={16} />
        {!iconOnly && buttonLabel}
        {active && <i className="speech-pulse" aria-hidden="true" />}
      </button>
      {status && <span className="speech-hint" aria-live="polite">{status}</span>}
    </div>
  );
}
