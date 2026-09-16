import { useCallback, useRef, useState } from "react";

// Chrome/Firefox record Opus-in-WebM; Safari only speaks MP4/AAC -- probing
// isTypeSupported picks whichever the browser actually has, same idea as
// RecordingPresets on mobile picking a per-platform container.
const PREFERRED_MIME_TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];

function pickMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "";
  for (const type of PREFERRED_MIME_TYPES) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return "";
}

// Mirrors the mobile app's useVoiceRecorder() hook shape (isRecording,
// currentTime, start/stop/cancel) so GroupChat.tsx's recording UI is a
// straightforward port of DmChatView's, just backed by MediaRecorder
// instead of expo-audio.
export function useVoiceRecorder() {
  const [isRecording, setIsRecording] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const startedAtRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function teardown() {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    recorderRef.current = null;
    setIsRecording(false);
  }

  const start = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    streamRef.current = stream;
    const mimeType = pickMimeType();
    const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
    chunksRef.current = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.start();
    recorderRef.current = recorder;
    startedAtRef.current = Date.now();
    setCurrentTime(0);
    setIsRecording(true);
    timerRef.current = setInterval(() => setCurrentTime((Date.now() - startedAtRef.current) / 1000), 200);
  }, []);

  const stop = useCallback((): Promise<{ blob: Blob; durationSeconds: number } | null> => {
    return new Promise((resolve) => {
      const recorder = recorderRef.current;
      if (!recorder) {
        resolve(null);
        return;
      }
      const durationSeconds = Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1000));
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        teardown();
        resolve(blob.size > 0 ? { blob, durationSeconds } : null);
      };
      recorder.stop();
    });
  }, []);

  const cancel = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") recorder.stop();
    teardown();
  }, []);

  return { isRecording, currentTime, start, stop, cancel };
}

export function formatDuration(seconds: number) {
  const s = Math.max(0, Math.round(seconds));
  const m = Math.floor(s / 60);
  const rest = s % 60;
  return `${m}:${String(rest).padStart(2, "0")}`;
}
