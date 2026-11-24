"use client";

/**
 * Browser recording hook.
 *
 * Wraps MediaRecorder + Web Audio so the recording page stays presentational.
 * Capabilities are probed rather than assumed: pause/resume, device labels and
 * even MediaRecorder itself are all optional. When something is missing the
 * hook reports it instead of failing silently.
 */

import { useCallback, useEffect, useRef, useState } from "react";

export type RecorderPhase = "idle" | "requesting" | "ready" | "recording" | "paused" | "stopped" | "error";

export type Capabilities = {
  readonly mediaRecorder: boolean;
  readonly getUserMedia: boolean;
  readonly pauseResume: boolean;
  readonly deviceSelection: boolean;
  readonly analyser: boolean;
  readonly mimeType: string | null;
  readonly unsupportedReason: string | null;
};

type DeviceOption = { deviceId: string; label: string };

/** Prefer Opus in WebM, fall back to whatever the browser offers. */
function pickMimeType(): string | null {
  if (typeof MediaRecorder === "undefined" || typeof MediaRecorder.isTypeSupported !== "function") return null;
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) ?? null;
}

export function useRecorder() {
  const [phase, setPhase] = useState<RecorderPhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [level, setLevel] = useState(0);
  const [levels, setLevels] = useState<number[]>([]);
  const [devices, setDevices] = useState<DeviceOption[]>([]);
  const [deviceId, setDeviceId] = useState<string>("");
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [blobSize, setBlobSize] = useState(0);
  const [capabilities, setCapabilities] = useState<Capabilities>({
    mediaRecorder: false,
    getUserMedia: false,
    pauseResume: false,
    deviceSelection: false,
    analyser: false,
    mimeType: null,
    unsupportedReason: null,
  });

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const urlRef = useRef<string | null>(null);

  /* Capability probe ----------------------------------------------------- */
  useEffect(() => {
    const hasRecorder = typeof window !== "undefined" && typeof window.MediaRecorder !== "undefined";
    const hasUserMedia = typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia);
    const hasAnalyser = typeof window !== "undefined" && typeof window.AudioContext !== "undefined";
    const mimeType = hasRecorder ? pickMimeType() : null;
    const pauseResume = hasRecorder && typeof MediaRecorder.prototype.pause === "function";

    let unsupportedReason: string | null = null;
    if (!hasRecorder) unsupportedReason = "This browser does not provide MediaRecorder, so audio cannot be recorded here.";
    else if (!hasUserMedia) unsupportedReason = "This browser cannot access a microphone (no getUserMedia).";
    else if (!mimeType) unsupportedReason = "No supported audio recording format was found in this browser.";

    setCapabilities({
      mediaRecorder: hasRecorder,
      getUserMedia: hasUserMedia,
      pauseResume,
      deviceSelection: hasUserMedia && typeof navigator.mediaDevices?.enumerateDevices === "function",
      analyser: hasAnalyser,
      mimeType,
      unsupportedReason,
    });
  }, []);

  const stopMeter = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const teardown = useCallback(() => {
    stopMeter();
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      void audioContextRef.current.close().catch(() => undefined);
    }
    audioContextRef.current = null;
    analyserRef.current = null;
  }, [stopMeter]);

  useEffect(() => teardown, [teardown]);

  const refreshDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      const inputs = all
        .filter((device) => device.kind === "audioinput")
        .map((device, index) => ({ deviceId: device.deviceId, label: device.label || `Microphone ${index + 1}` }));
      setDevices(inputs);
      setDeviceId((current) => current || inputs[0]?.deviceId || "");
    } catch {
      // Enumerating can fail without permission; the select simply stays empty.
    }
  }, []);

  const requestPermission = useCallback(async () => {
    if (!capabilities.getUserMedia) {
      setError(capabilities.unsupportedReason ?? "Microphone access is not available in this browser.");
      setPhase("error");
      return false;
    }
    setPhase("requesting");
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: deviceId ? { deviceId: { exact: deviceId } } : true,
      });
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = stream;

      if (capabilities.analyser) {
        const context = new AudioContext();
        const source = context.createMediaStreamSource(stream);
        const analyser = context.createAnalyser();
        analyser.fftSize = 2048;
        source.connect(analyser);
        audioContextRef.current = context;
        analyserRef.current = analyser;
        const buffer = new Uint8Array(analyser.fftSize);
        const tick = () => {
          const node = analyserRef.current;
          if (!node) return;
          node.getByteTimeDomainData(buffer);
          let sum = 0;
          for (let i = 0; i < buffer.length; i += 1) {
            const centred = (buffer[i] ?? 128) - 128;
            sum += centred * centred;
          }
          const rms = Math.sqrt(sum / buffer.length) / 128;
          const value = Math.min(1, rms * 3.2);
          setLevel(value);
          setLevels((previous) => [...previous.slice(-90), value]);
          rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
      }

      await refreshDevices();
      setPhase("ready");
      return true;
    } catch (cause) {
      const name = cause instanceof DOMException ? cause.name : "";
      const message =
        name === "NotAllowedError" || name === "SecurityError"
          ? "Microphone permission was denied. Allow access in the browser's site settings, then try again."
          : name === "NotFoundError" || name === "OverconstrainedError"
            ? "No microphone was found for that device. Choose another input."
            : name === "NotReadableError"
              ? "The microphone is in use by another application."
              : "The microphone could not be opened.";
      setError(message);
      setPhase("error");
      return false;
    }
  }, [capabilities.analyser, capabilities.getUserMedia, capabilities.unsupportedReason, deviceId, refreshDevices]);

  const start = useCallback(async () => {
    setError(null);
    const stream = streamRef.current ?? (await (async () => {
      const granted = await requestPermission();
      return granted ? streamRef.current : null;
    })());
    if (!stream) return;
    if (!capabilities.mimeType) {
      setError(capabilities.unsupportedReason ?? "Recording is not supported in this browser.");
      setPhase("error");
      return;
    }

    chunksRef.current = [];
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
      setBlobUrl(null);
    }
    setSeconds(0);
    setLevels([]);

    try {
      const recorder = new MediaRecorder(stream, { mimeType: capabilities.mimeType });
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || capabilities.mimeType || "audio/webm" });
        const url = URL.createObjectURL(blob);
        urlRef.current = url;
        setBlobUrl(url);
        setBlobSize(blob.size);
        setPhase("stopped");
        stopMeter();
        setLevel(0);
      };
      recorder.onerror = () => {
        setError("Recording stopped because the browser reported an error.");
        setPhase("error");
      };
      recorder.start(1000);
      recorderRef.current = recorder;
      setPhase("recording");
      timerRef.current = setInterval(() => setSeconds((value) => value + 1), 1000);
    } catch {
      setError("The browser refused to start recording with this microphone.");
      setPhase("error");
    }
  }, [capabilities.mimeType, capabilities.unsupportedReason, requestPermission, stopMeter]);

  const pause = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state !== "recording") return;
    if (!capabilities.pauseResume) {
      setError("This browser cannot pause a recording — stop and start a new take instead.");
      return;
    }
    recorder.pause();
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    setPhase("paused");
  }, [capabilities.pauseResume]);

  const resume = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state !== "paused") return;
    recorder.resume();
    timerRef.current = setInterval(() => setSeconds((value) => value + 1), 1000);
    setPhase("recording");
  }, []);

  const stop = useCallback(() => {
    const recorder = recorderRef.current;
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    }
    recorderRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    stopMeter();
  }, [stopMeter]);

  const reset = useCallback(() => {
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
    setBlobUrl(null);
    setBlobSize(0);
    setSeconds(0);
    setLevels([]);
    setLevel(0);
    setError(null);
    setPhase("idle");
  }, []);

  /** Read the duration of a recorded blob for the media library record. */
  const measureDuration = useCallback(async (): Promise<number | null> => {
    if (!blobUrl) return null;
    return new Promise((resolve) => {
      const audio = new Audio();
      audio.preload = "metadata";
      audio.onloadedmetadata = () => resolve(Number.isFinite(audio.duration) ? Math.round(audio.duration) : null);
      audio.onerror = () => resolve(null);
      audio.src = blobUrl;
    });
  }, [blobUrl]);

  return {
    phase,
    error,
    seconds,
    level,
    levels,
    devices,
    deviceId,
    setDeviceId,
    blobUrl,
    blobSize,
    capabilities,
    start,
    pause,
    resume,
    stop,
    reset,
    requestPermission,
    measureDuration,
  };
}
