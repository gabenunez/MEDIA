"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { Volume2, VolumeX } from "lucide-react";
import { cn } from "@/lib/utils";

export const THEME_MUSIC_ENABLED_KEY = "reel-theme-music-enabled";
const THEME_MUSIC_CHANGED_EVENT = "reel-theme-music-changed";

function readEnabled(): boolean {
  if (typeof window === "undefined") return true;
  return localStorage.getItem(THEME_MUSIC_ENABLED_KEY) !== "0";
}

type ThemeMusicSettingsContextValue = {
  enabled: boolean;
  mute: () => void;
  unmute: () => void;
  toggle: () => void;
};

const ThemeMusicSettingsContext = createContext<ThemeMusicSettingsContextValue>({
  enabled: true,
  mute: () => {},
  unmute: () => {},
  toggle: () => {},
});

export function useThemeMusicSettings() {
  return useContext(ThemeMusicSettingsContext);
}

export function isThemeMusicEnabled(): boolean {
  return readEnabled();
}

function notifyChange() {
  window.dispatchEvent(new Event(THEME_MUSIC_CHANGED_EVENT));
}

export function ThemeMusicSettingsProvider({ children }: { children: ReactNode }) {
  const [enabled, setEnabled] = useState(readEnabled);

  useEffect(() => {
    const sync = () => setEnabled(readEnabled());
    window.addEventListener(THEME_MUSIC_CHANGED_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(THEME_MUSIC_CHANGED_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const mute = useCallback(() => {
    localStorage.setItem(THEME_MUSIC_ENABLED_KEY, "0");
    setEnabled(false);
    notifyChange();
  }, []);

  const unmute = useCallback(() => {
    localStorage.removeItem(THEME_MUSIC_ENABLED_KEY);
    setEnabled(true);
    notifyChange();
  }, []);

  const toggle = useCallback(() => {
    if (enabled) mute();
    else unmute();
  }, [enabled, mute, unmute]);

  return (
    <ThemeMusicSettingsContext.Provider value={{ enabled, mute, unmute, toggle }}>
      {children}
    </ThemeMusicSettingsContext.Provider>
  );
}

export function ThemeMusicMuteButton({ className }: { className?: string }) {
  const { enabled, toggle } = useThemeMusicSettings();

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={enabled ? "Mute theme music" : "Unmute theme music"}
      title={enabled ? "Mute theme music" : "Theme music muted"}
      className={cn(
        "inline-flex h-9 w-9 items-center justify-center rounded-md border border-white/10 bg-background/55 text-foreground/90 backdrop-blur transition-colors hover:bg-background/80 hover:text-foreground",
        className,
      )}
    >
      {enabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
    </button>
  );
}
