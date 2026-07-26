(function () {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const LOCAL_RECORDING_MAX_MS = 10000;
  const TRANSCRIBE_ENDPOINT = "/api/transcribe-audio";

  function isSupported() {
    return Boolean(canUseLocalRecorder() || Recognition);
  }

  function canUseLocalRecorder() {
    return Boolean(navigator.mediaDevices?.getUserMedia && window.MediaRecorder && window.fetch && window.FileReader);
  }

  function pickAudioMimeType() {
    const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
    return candidates.find((mimeType) => window.MediaRecorder?.isTypeSupported?.(mimeType)) || "";
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.addEventListener("load", () => resolve(String(reader.result || "")));
      reader.addEventListener("error", () => reject(new Error("录音读取失败。")));
      reader.readAsDataURL(blob);
    });
  }

  async function postAudioForTranscription(blob) {
    const audioDataUrl = await blobToDataUrl(blob);
    const response = await fetch(TRANSCRIBE_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ audioDataUrl, mimeType: blob.type || "audio/webm" }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(formatTranscriptionError(payload));
    }
    return payload;
  }

  function formatTranscriptionError(payload) {
    const base = payload.error || "本地语音转写失败。";
    const diagnostics = payload.diagnostics;
    if (!diagnostics) return base;

    const detail = [];
    if (diagnostics.durationSeconds !== null && diagnostics.durationSeconds !== undefined) {
      detail.push(`${diagnostics.durationSeconds} 秒`);
    }
    if (diagnostics.maxVolumeDb !== null && diagnostics.maxVolumeDb !== undefined) {
      detail.push(`峰值 ${diagnostics.maxVolumeDb} dB`);
    }
    return detail.length ? `${base}（录音检测：${detail.join("，")}）` : base;
  }

  function createSpeechInput({ button, status, onTranscript }) {
    if (!button) {
      return {
        setDisabled() {},
        stop() {},
      };
    }

    const idleLabel = button.textContent;
    let recognition = null;
    let listening = false;
    let recording = false;
    let transcribing = false;
    let disabled = false;
    let mediaRecorder = null;
    let mediaStream = null;
    let audioContext = null;
    let volumeTimer = null;
    let audioChunks = [];
    let maxRecordingTimer = null;

    function setStatus(message) {
      if (status) status.textContent = message;
    }

    function syncButton() {
      button.disabled = disabled || transcribing || !isSupported();
      button.classList.toggle("listening", listening || recording);
      if (transcribing) {
        button.textContent = "转写中...";
      } else if (recording) {
        button.textContent = "结束录音";
      } else if (listening) {
        button.textContent = "正在听...";
      } else {
        button.textContent = idleLabel;
      }
    }

    function setListening(next) {
      listening = next;
      syncButton();
    }

    function setRecording(next) {
      recording = next;
      syncButton();
    }

    function setTranscribing(next) {
      transcribing = next;
      syncButton();
    }

    function stopStream() {
      if (maxRecordingTimer) {
        clearTimeout(maxRecordingTimer);
        maxRecordingTimer = null;
      }
      stopVolumeMeter();
      if (mediaStream) {
        mediaStream.getTracks().forEach((track) => track.stop());
        mediaStream = null;
      }
    }

    function stopVolumeMeter() {
      if (volumeTimer) {
        clearInterval(volumeTimer);
        volumeTimer = null;
      }
      if (audioContext) {
        audioContext.close().catch(() => {});
        audioContext = null;
      }
    }

    function startVolumeMeter(stream) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;

      audioContext = new AudioContext();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);

      const samples = new Uint8Array(analyser.fftSize);
      volumeTimer = window.setInterval(() => {
        analyser.getByteTimeDomainData(samples);
        let sumSquares = 0;
        for (const value of samples) {
          const centered = (value - 128) / 128;
          sumSquares += centered * centered;
        }
        const rms = Math.sqrt(sumSquares / samples.length);
        const level = Math.min(100, Math.round(rms * 260));
        setStatus(`正在本地录音，再点一次结束；音量 ${level}%。`);
      }, 300);
    }

    async function finalizeLocalRecording() {
      setRecording(false);
      stopStream();

      const blob = new Blob(audioChunks, { type: mediaRecorder?.mimeType || "audio/webm" });
      audioChunks = [];
      mediaRecorder = null;

      if (blob.size < 1024) {
        setStatus("录音太短，没有识别到有效语音。");
        return;
      }

      try {
        setTranscribing(true);
        setStatus("录音完成，正在转写语音...");
        const payload = await postAudioForTranscription(blob);
        const transcript = String(payload.transcript || "").trim();
        if (!transcript) {
          setStatus("没有识别到有效语音，可再试一次或手动输入。");
          return;
        }
        onTranscript(transcript);
        setStatus(payload.fallbackFromOnDevice ? "设备端识别超时，已用 macOS 系统识别写入，可手动修改后继续。" : "本地语音已写入，可手动修改后继续。");
      } catch (error) {
        setStatus(error.message || "本地语音转写失败，可手动输入目标菜。");
      } finally {
        setTranscribing(false);
      }
    }

    async function startLocalRecording() {
      try {
        const mimeType = pickAudioMimeType();
        mediaStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
          },
        });
        startVolumeMeter(mediaStream);
        audioChunks = [];
        mediaRecorder = new MediaRecorder(mediaStream, mimeType ? { mimeType } : undefined);
        mediaRecorder.addEventListener("dataavailable", (event) => {
          if (event.data?.size) audioChunks.push(event.data);
        });
        mediaRecorder.addEventListener("stop", finalizeLocalRecording, { once: true });
        mediaRecorder.start();
        setRecording(true);
        setStatus("正在本地录音，再点一次结束；最长 10 秒。");
        maxRecordingTimer = window.setTimeout(() => {
          if (mediaRecorder?.state === "recording") mediaRecorder.stop();
        }, LOCAL_RECORDING_MAX_MS);
      } catch (error) {
        stopStream();
        setRecording(false);
        const message = error?.name === "NotAllowedError" ? "麦克风权限未开启，可手动输入目标菜。" : "无法开始本地录音，尝试浏览器语音服务。";
        setStatus(message);
        if (Recognition && error?.name !== "NotAllowedError") {
          startBrowserRecognition();
        }
      }
    }

    function stopLocalRecording() {
      if (mediaRecorder?.state === "recording") {
        mediaRecorder.stop();
      }
    }

    function ensureRecognition() {
      if (recognition) return recognition;

      recognition = new Recognition();
      recognition.lang = "zh-CN";
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;

      recognition.addEventListener("start", () => {
        setListening(true);
        setStatus("正在听，请说出想吃的菜或补充要求。");
      });

      recognition.addEventListener("result", (event) => {
        let interim = "";
        let finalText = "";

        for (let index = event.resultIndex; index < event.results.length; index += 1) {
          const transcript = event.results[index][0]?.transcript?.trim() || "";
          if (event.results[index].isFinal) {
            finalText += transcript;
          } else {
            interim += transcript;
          }
        }

        if (interim) {
          setStatus(`听到：${interim}`);
        }

        if (finalText.trim()) {
          onTranscript(finalText.trim());
          setStatus("已写入，可手动修改后继续。");
        }
      });

      recognition.addEventListener("error", (event) => {
        const messages = {
          "not-allowed": "麦克风权限未开启，可手动输入目标菜。",
          "no-speech": "没有听到有效语音，可以再试一次或手动输入。",
          "audio-capture": "没有检测到麦克风，可手动输入目标菜。",
          network: "浏览器备用语音服务连不上，可手动输入目标菜。",
        };
        setStatus(messages[event.error] || "语音识别失败，可手动输入目标菜。");
      });

      recognition.addEventListener("end", () => {
        setListening(false);
      });

      return recognition;
    }

    function startBrowserRecognition() {
      if (!Recognition) return;
      const instance = ensureRecognition();
      if (listening) {
        instance.stop();
        return;
      }
      try {
        instance.start();
      } catch {
        setStatus("语音识别正在准备中，请稍后再试。");
      }
    }

    if (!isSupported()) {
      disabled = true;
      syncButton();
      setStatus("当前浏览器不支持语音输入，可手动输入。");
    } else if (canUseLocalRecorder()) {
      setStatus("可点击语音输入，本地录音后转成目标菜文字。");
      syncButton();
    } else {
      setStatus("可点击语音输入，说出想吃的菜或补充要求。");
      syncButton();
    }

    button.addEventListener("click", () => {
      if (disabled || transcribing || !isSupported()) return;
      if (recording) {
        stopLocalRecording();
        return;
      }
      if (canUseLocalRecorder()) {
        startLocalRecording();
        return;
      }
      startBrowserRecognition();
    });

    return {
      setDisabled(next) {
        disabled = Boolean(next);
        syncButton();
      },
      stop() {
        if (mediaRecorder?.state === "recording") stopLocalRecording();
        if (recognition && listening) recognition.stop();
      },
    };
  }

  window.FridgeSpeech = {
    isSupported,
    createSpeechInput,
  };
})();
