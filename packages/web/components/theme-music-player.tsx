"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { api } from "@/lib/api";
import { ensureAudioUnlocked, getSharedAudioContext } from "@/lib/audio-unlock";
import { useThemeMusicSettings } from "@/components/theme-music-settings";
import { isTvClient } from "@/lib/tv-mode-detect";
import { findWaveformPeaks, syntheticTrace, traceFromTimeDomain } from "@/lib/theme-waveform";

const TARGET_VOLUME = 0.38;
const FADE_MS = 1800;
const MAX_PLAY_MS = 42_000;

const themeBlobCache = new Map<number, Blob>();
const themeBlobInflight = new Map<number, Promise<Blob>>();

function fadeVolume(
  audio: HTMLAudioElement,
  from: number,
  to: number,
  durationMs: number,
  onDone?: () => void,
): () => void {
  const started = performance.now();
  let frame = 0;

  const step = (now: number) => {
    const t = Math.min(1, (now - started) / durationMs);
    audio.volume = from + (to - from) * t;
    if (t < 1) {
      frame = requestAnimationFrame(step);
    } else {
      onDone?.();
    }
  };

  frame = requestAnimationFrame(step);
  return () => cancelAnimationFrame(frame);
}

async function loadThemeBlob(mediaId: number, signal: AbortSignal): Promise<Blob> {
  const cached = themeBlobCache.get(mediaId);
  if (cached) return cached;

  const pending = themeBlobInflight.get(mediaId);
  if (pending) return pending;

  const request = (async () => {
    const res = await fetch(api.themeMusicUrl(mediaId), {
      credentials: "include",
      signal,
    });
    if (!res.ok) throw new Error("Theme unavailable");

    const blob = await res.blob();
    themeBlobCache.set(mediaId, blob);
    return blob;
  })();

  themeBlobInflight.set(mediaId, request);
  try {
    return await request;
  } finally {
    themeBlobInflight.delete(mediaId);
  }
}

/** Warm theme audio on carousel hover/focus without creating playback state. */
export function prefetchThemeMusic(mediaId: number): void {
  if (!Number.isFinite(mediaId)) return;
  void loadThemeBlob(mediaId, new AbortController().signal).catch(() => {});
}

function tryAttachAnalyser(element: HTMLAudioElement): AnalyserNode | null {
  try {
    const audioContext = getSharedAudioContext();
    const source = audioContext.createMediaElementSource(element);
    const analyser = audioContext.createAnalyser();
    // Time-domain window for the oscilloscope trace; leaves room to find a
    // rising zero crossing before the WAVEFORM_WINDOW samples we draw.
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.82;
    source.connect(analyser);
    analyser.connect(audioContext.destination);
    return analyser;
  } catch {
    return null;
  }
}

type ThemeMusicContextValue = {
  isPlaying: boolean;
  analyser: AnalyserNode | null;
};

const ThemeMusicContext = createContext<ThemeMusicContextValue>({
  isPlaying: false,
  analyser: null,
});

export function useThemeMusic() {
  return useContext(ThemeMusicContext);
}

interface ThemeMusicProviderProps {
  mediaId: number;
  enabled?: boolean;
  children: ReactNode;
}

export function ThemeMusicProvider({
  mediaId,
  enabled = true,
  children,
}: ThemeMusicProviderProps) {
  const { enabled: themeMusicEnabled } = useThemeMusicSettings();
  const playThemeMusic = isTvClient() || themeMusicEnabled;
  const [isPlaying, setIsPlaying] = useState(false);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const stopFadeRef = useRef<(() => void) | null>(null);
  const stopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!playThemeMusic) {
      cleanupRef.current?.();
    }
  }, [playThemeMusic]);

  useEffect(() => {
    if (!enabled || !mediaId || !playThemeMusic) return;

    const session = Symbol("theme-session");
    let activeSession: symbol | null = session;
    let objectUrl: string | null = null;
    let audio: HTMLAudioElement | null = null;
    let readyHandler: (() => void) | null = null;
    let playbackStarted = false;
    let playbackQueued = false;
    let retryListenersAttached = false;
    const abortController = new AbortController();

    const isActive = () => activeSession === session;

    const cleanup = () => {
      activeSession = null;
      setIsPlaying(false);
      setAnalyser(null);
      stopFadeRef.current?.();
      stopFadeRef.current = null;
      if (stopTimerRef.current) {
        clearTimeout(stopTimerRef.current);
        stopTimerRef.current = null;
      }
      if (audio) {
        if (readyHandler) {
          audio.removeEventListener("loadeddata", readyHandler);
          audio.removeEventListener("canplay", readyHandler);
          audio.removeEventListener("canplaythrough", readyHandler);
          readyHandler = null;
        }
        audio.pause();
        audio.removeAttribute("src");
        audio.load();
        audio = null;
      }
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
        objectUrl = null;
      }
      abortController.abort();
    };

    cleanupRef.current = cleanup;

    const removeRetryListeners = (handler: () => void) => {
      document.removeEventListener("pointerdown", handler, true);
      document.removeEventListener("keydown", handler, true);
      retryListenersAttached = false;
    };

    const scheduleStop = () => {
      if (!audio) return;
      const playForMs = Math.min(
        MAX_PLAY_MS,
        Number.isFinite(audio.duration) && audio.duration > 0
          ? audio.duration * 1000
          : MAX_PLAY_MS,
      );

      stopTimerRef.current = setTimeout(() => {
        if (!isActive() || !audio) return;
        stopFadeRef.current = fadeVolume(audio, audio.volume, 0, FADE_MS, () => {
          cleanup();
        });
      }, playForMs);
    };

    const beginAudiblePlayback = () => {
      if (!audio || !isActive()) return;

      audio.muted = false;
      setIsPlaying(true);
      stopFadeRef.current = fadeVolume(audio, 0, TARGET_VOLUME, FADE_MS);
      scheduleStop();

      window.setTimeout(() => {
        if (!isActive() || !audio || !audio.paused) return;
        void audio.play().catch(() => {});
      }, 400);
    };

    const attemptPlay = async () => {
      if (!isActive() || !audio || playbackStarted) return;
      playbackStarted = true;

      audio.muted = true;
      audio.volume = 0;

      await ensureAudioUnlocked();

      const node = tryAttachAnalyser(audio);
      if (node) {
        setAnalyser(node);
        await getSharedAudioContext().resume();
      }

      try {
        await audio.play();
      } catch {
        playbackStarted = false;
        throw new Error("play blocked");
      }

      if (!isActive() || !audio) return;
      beginAudiblePlayback();
    };

    const queueGestureRetry = () => {
      if (!isActive() || retryListenersAttached) return;
      retryListenersAttached = true;

      const retry = () => {
        removeRetryListeners(retry);
        if (!isActive() || !audio) return;
        void attemptPlay().catch(() => {
          playbackStarted = false;
        });
      };

      document.addEventListener("pointerdown", retry, { once: true, capture: true });
      document.addEventListener("keydown", retry, { once: true, capture: true });
    };

    const queuePlayback = () => {
      if (!isActive() || !audio || playbackStarted || playbackQueued) return;
      playbackQueued = true;
      void attemptPlay().catch(() => {
        playbackStarted = false;
        playbackQueued = false;
        queueGestureRetry();
      });
    };

    void loadThemeBlob(mediaId, abortController.signal)
      .then((blob) => {
        if (!isActive()) return;

        objectUrl = URL.createObjectURL(blob);
        audio = new Audio(objectUrl);
        audio.preload = "auto";
        audio.volume = 0;

        let readyHandled = false;
        readyHandler = () => {
          if (readyHandled) return;
          readyHandled = true;
          queuePlayback();
        };
        audio.addEventListener("loadeddata", readyHandler);
        audio.addEventListener("canplay", readyHandler);
        audio.addEventListener("canplaythrough", readyHandler);
        audio.addEventListener("ended", () => {
          if (isActive()) cleanup();
        });
        audio.addEventListener("error", () => {
          if (isActive()) cleanup();
        }, { once: true });

        audio.load();

        if (audio.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
          queuePlayback();
        }
      })
      .catch(() => {
        if (isActive()) cleanup();
      });

    return () => {
      cleanup();
      cleanupRef.current = null;
    };
  }, [mediaId, enabled, playThemeMusic]);

  return (
    <ThemeMusicContext.Provider value={{ isPlaying, analyser }}>
      {children}
    </ThemeMusicContext.Provider>
  );
}

/** Transparent live waveform for the media detail banner. */
export function ThemeMusicWaveform({ className = "" }: { className?: string }) {
  const { isPlaying, analyser } = useThemeMusic();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameRef = useRef(0);
  const analyserRef = useRef(analyser);

  useEffect(() => {
    analyserRef.current = analyser;
  }, [analyser]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !isPlaying) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let samples = new Uint8Array(0);
    let shown = new Float32Array(0);
    let gain = 1;
    let lineStroke: CanvasGradient | string = "hsl(174 84% 52% / 0.7)";
    let markStroke = "hsl(174 84% 52% / 0.45)";

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.floor(rect.width * dpr);
      canvas.height = Math.floor(rect.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const styles = getComputedStyle(document.documentElement);
      const primary = styles.getPropertyValue("--primary").trim() || "174 84% 52%";
      const accent = styles.getPropertyValue("--accent").trim() || "78 86% 60%";
      const gradient = ctx.createLinearGradient(0, 0, rect.width, 0);
      gradient.addColorStop(0, `hsl(${primary} / 0.45)`);
      gradient.addColorStop(0.55, `hsl(${primary} / 0.8)`);
      gradient.addColorStop(1, `hsl(${accent} / 0.7)`);
      lineStroke = gradient;
      markStroke = `hsl(${primary} / 0.55)`;
    };

    resize();
    window.addEventListener("resize", resize);

    const draw = () => {
      const node = analyserRef.current;
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;

      ctx.clearRect(0, 0, width, height);

      if (width < 8 || height < 8) {
        frameRef.current = requestAnimationFrame(draw);
        return;
      }

      // One point every ~2 CSS px keeps crests sharp without per-pixel work on TV.
      const points = Math.max(24, Math.min(600, Math.round(width / 2)));
      let trace: Float32Array;
      if (node) {
        if (samples.length !== node.fftSize) samples = new Uint8Array(node.fftSize);
        node.getByteTimeDomainData(samples);
        trace = traceFromTimeDomain(samples, points);
      } else {
        trace = syntheticTrace(points, performance.now());
      }

      // Auto-gain so quiet themes still show their shape; ease it to avoid pumping.
      let peak = 0;
      for (let i = 0; i < trace.length; i++) peak = Math.max(peak, Math.abs(trace[i]));
      const targetGain = Math.min(6, 0.9 / Math.max(peak, 0.08));
      gain += (targetGain - gain) * 0.08;

      // Blend with the last frame so the trace drifts instead of flickering.
      if (shown.length !== points) shown = new Float32Array(trace);
      for (let i = 0; i < points; i++) {
        const target = Math.max(-1, Math.min(1, trace[i] * gain));
        shown[i] += (target - shown[i]) * 0.45;
      }

      const midY = height * 0.58;
      const amplitude = height * 0.36;
      const step = width / (points - 1);
      const yAt = (i: number) => midY - shown[i] * amplitude;

      // Peak marks: thin verticals from each main crest down to the floor.
      const peaks = findWaveformPeaks(shown, {
        minGap: Math.max(4, Math.round(points / 6)),
        minValue: 0.25,
        maxCount: 5,
      });
      ctx.strokeStyle = markStroke;
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (const index of peaks) {
        const x = index * step;
        ctx.moveTo(x, yAt(index) + 2);
        ctx.lineTo(x, height);
      }
      ctx.stroke();

      // Trace: quadratic curves through midpoints read as one continuous line.
      ctx.strokeStyle = lineStroke;
      ctx.lineWidth = 1.5;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(0, yAt(0));
      for (let i = 1; i < points - 1; i++) {
        const x = i * step;
        ctx.quadraticCurveTo(x, yAt(i), x + step / 2, (yAt(i) + yAt(i + 1)) / 2);
      }
      ctx.lineTo(width, yAt(points - 1));
      ctx.stroke();

      frameRef.current = requestAnimationFrame(draw);
    };

    frameRef.current = requestAnimationFrame(draw);

    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(frameRef.current);
      ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
    };
  }, [isPlaying]);

  if (!isPlaying) return null;

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className={`pointer-events-none ${className}`}
    />
  );
}

/** @deprecated Use ThemeMusicProvider + ThemeMusicWaveform */
export function ThemeMusicPlayer({
  mediaId,
  enabled = true,
}: {
  mediaId: number;
  enabled?: boolean;
}) {
  return (
    <ThemeMusicProvider mediaId={mediaId} enabled={enabled}>
      {null}
    </ThemeMusicProvider>
  );
}
