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

const THEME_MUSIC_ENABLED_KEY = "reel-theme-music-enabled";
const TARGET_VOLUME = 0.38;
const FADE_MS = 1800;
const MAX_PLAY_MS = 42_000;

function isThemeMusicEnabled(): boolean {
  if (typeof window === "undefined") return true;
  const stored = localStorage.getItem(THEME_MUSIC_ENABLED_KEY);
  return stored !== "0";
}

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
  const [isPlaying, setIsPlaying] = useState(false);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const stopFadeRef = useRef<(() => void) | null>(null);
  const stopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!enabled || !mediaId || !isThemeMusicEnabled()) return;

    let objectUrl: string | null = null;
    let cancelled = false;
    let started = false;
    let audio: HTMLAudioElement | null = null;

    const cleanup = () => {
      cancelled = true;
      setIsPlaying(false);
      stopFadeRef.current?.();
      stopFadeRef.current = null;
      if (stopTimerRef.current) {
        clearTimeout(stopTimerRef.current);
        stopTimerRef.current = null;
      }
      if (audio) {
        audio.pause();
        audio.removeAttribute("src");
        audio.load();
      }
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
        objectUrl = null;
      }
      setAnalyser(null);
      audioRef.current = null;
    };

    const removeRetryListeners = (handler: () => void) => {
      document.removeEventListener("pointerdown", handler, true);
      document.removeEventListener("keydown", handler, true);
    };

    let analyserAttached = false;

    const attachAnalyser = (element: HTMLAudioElement) => {
      if (analyserAttached) return;
      try {
        const audioContext = getSharedAudioContext();
        const source = audioContext.createMediaElementSource(element);
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 128;
        analyser.smoothingTimeConstant = 0.82;
        source.connect(analyser);
        analyser.connect(audioContext.destination);
        setAnalyser(analyser);
        analyserAttached = true;
        void audioContext.resume();
      } catch {
        setAnalyser(null);
      }
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
        if (cancelled || !audio) return;
        stopFadeRef.current = fadeVolume(audio, audio.volume, 0, FADE_MS, () => {
          cleanup();
        });
      }, playForMs);
    };

    const attemptPlay = async () => {
      if (cancelled || !audio) return;

      audio.muted = true;
      audio.volume = 0;
      await ensureAudioUnlocked();
      await audio.play();

      if (cancelled) return;

      attachAnalyser(audio);
      audio.muted = false;
      setIsPlaying(true);
      stopFadeRef.current = fadeVolume(audio, 0, TARGET_VOLUME, FADE_MS);
      scheduleStop();
    };

    const startPlayback = () => {
      if (cancelled || started || !audio) return;
      started = true;

      void attemptPlay().catch(() => {
        if (cancelled || !audio) return;
        started = false;

        const retry = () => {
          removeRetryListeners(retry);
          if (cancelled || !audio) return;
          started = true;
          void attemptPlay().catch(() => {
            started = false;
            cleanup();
          });
        };

        document.addEventListener("pointerdown", retry, { once: true, capture: true });
        document.addEventListener("keydown", retry, { once: true, capture: true });
      });
    };

    void fetch(api.themeMusicUrl(mediaId), { credentials: "include" })
      .then((res) => {
        if (!res.ok) throw new Error("Theme unavailable");
        return res.blob();
      })
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        audio = new Audio(objectUrl);
        audio.preload = "auto";
        audio.volume = 0;
        audioRef.current = audio;
        audio.addEventListener("canplaythrough", startPlayback, { once: true });
        audio.addEventListener("pause", () => setIsPlaying(false));
        audio.addEventListener("ended", () => setIsPlaying(false));
        audio.addEventListener("error", cleanup, { once: true });
        audio.load();
      })
      .catch(() => cleanup());

    return cleanup;
  }, [mediaId, enabled]);

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

    const buffer = new Uint8Array(64);

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.floor(rect.width * dpr);
      canvas.height = Math.floor(rect.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();
    window.addEventListener("resize", resize);

    const draw = () => {
      const node = analyserRef.current;
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;

      ctx.clearRect(0, 0, width, height);

      if (node) {
        node.getByteFrequencyData(buffer.subarray(0, node.frequencyBinCount));
      }

      const barCount = 56;
      const gap = 2;
      const barWidth = (width - gap * (barCount - 1)) / barCount;
      const midY = height * 0.62;

      for (let i = 0; i < barCount; i++) {
        const sample =
          node && buffer.length > 0
            ? buffer[Math.floor((i / barCount) * buffer.length)] / 255
            : 0.12 + Math.sin(performance.now() / 280 + i * 0.35) * 0.06;

        const amplitude = Math.max(0.06, sample);
        const barHeight = amplitude * height * 0.42;
        const x = i * (barWidth + gap);
        const alpha = 0.12 + amplitude * 0.38;

        ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
        ctx.beginPath();
        ctx.roundRect(x, midY - barHeight, barWidth, barHeight * 2, barWidth / 2);
        ctx.fill();
      }

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
