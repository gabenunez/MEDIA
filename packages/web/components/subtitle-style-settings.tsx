"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { ChevronLeft } from "lucide-react";
import { TvFocusButton } from "@/components/tv/tv-focus-link";
import {
  TvWatchMenuList,
  TvWatchMenuSectionLabel,
  tvWatchMenuOptionClassName,
} from "@/components/tv/tv-watch-settings-menu";
import { cn } from "@/lib/utils";
import { nativeSubtitleStylesAvailable } from "@/lib/android-bridge";
import {
  DEFAULT_SUBTITLE_STYLES,
  SUBTITLE_BACKGROUND_OPACITY_OPTIONS,
  SUBTITLE_BACKGROUND_OPTIONS,
  SUBTITLE_COLOR_OPTIONS,
  SUBTITLE_EDGE_OPTIONS,
  SUBTITLE_FONT_OPTIONS,
  SUBTITLE_OPACITY_OPTIONS,
  SUBTITLE_SIZE_OPTIONS,
  SUBTITLE_STYLES_CHANGED_EVENT,
  applySubtitleStyles,
  previewSubtitleStyles,
  readSubtitleStyles,
  writeSubtitleStyles,
  type SubtitleColor,
  type SubtitleEdge,
  type SubtitleFont,
  type SubtitleOpacity,
  type SubtitleSize,
  type SubtitleStyles,
  type SubtitleBackgroundOpacity,
} from "@/lib/subtitle-styles";

const SUBTITLE_SWATCH_COLORS: Record<SubtitleColor, string> = {
  white: "#ffffff",
  yellow: "#ffeb3b",
  green: "#76ff7a",
  cyan: "#4de8ff",
  blue: "#82aaff",
  magenta: "#ff80ff",
  red: "#ff6b6b",
  black: "#000000",
};

const SIZE_SEGMENTS: Array<{ value: SubtitleSize; label: string }> = [
  { value: "small", label: "S" },
  { value: "medium", label: "M" },
  { value: "large", label: "L" },
  { value: "extra-large", label: "XL" },
];

const FONT_SEGMENTS: Array<{ value: SubtitleFont; label: string }> = [
  { value: "default", label: "Sans" },
  { value: "serif", label: "Serif" },
  { value: "monospace", label: "Mono" },
];

const EDGE_SEGMENTS: Array<{ value: SubtitleEdge; label: string }> = [
  { value: "none", label: "None" },
  { value: "drop-shadow", label: "Shadow" },
  { value: "outline", label: "Outline" },
];

const OPACITY_SEGMENTS: Array<{ value: SubtitleOpacity; label: string }> = [
  { value: "100", label: "100" },
  { value: "75", label: "75" },
  { value: "50", label: "50" },
  { value: "25", label: "25" },
];

const BG_OPACITY_SEGMENTS: Array<{ value: SubtitleBackgroundOpacity; label: string }> = [
  { value: "100", label: "100" },
  { value: "75", label: "75" },
  { value: "50", label: "50" },
  { value: "25", label: "25" },
  { value: "0", label: "0" },
];

type SubtitleStylesContextValue = {
  styles: SubtitleStyles;
  setStyles: (styles: SubtitleStyles) => void;
  updateStyle: <K extends keyof SubtitleStyles>(key: K, value: SubtitleStyles[K]) => void;
  resetStyles: () => void;
};

const SubtitleStylesContext = createContext<SubtitleStylesContextValue>({
  styles: DEFAULT_SUBTITLE_STYLES,
  setStyles: () => {},
  updateStyle: () => {},
  resetStyles: () => {},
});

export function useSubtitleStyles() {
  return useContext(SubtitleStylesContext);
}

export function SubtitleStylesProvider({ children }: { children: ReactNode }) {
  const [styles, setStylesState] = useState(readSubtitleStyles);

  const setStyles = useCallback((next: SubtitleStyles | ((prev: SubtitleStyles) => SubtitleStyles)) => {
    setStylesState((prev) => (typeof next === "function" ? next(prev) : next));
  }, []);

  const updateStyle = useCallback(
    <K extends keyof SubtitleStyles>(key: K, value: SubtitleStyles[K]) => {
      setStyles((prev) => ({ ...prev, [key]: value }));
    },
    [setStyles],
  );

  const resetStyles = useCallback(() => {
    setStyles(DEFAULT_SUBTITLE_STYLES);
  }, [setStyles]);

  useEffect(() => {
    writeSubtitleStyles(styles);
    applySubtitleStyles(styles);
    window.dispatchEvent(new Event(SUBTITLE_STYLES_CHANGED_EVENT));
  }, [styles]);

  useEffect(() => {
    const sync = () => {
      setStylesState(readSubtitleStyles());
    };
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("storage", sync);
    };
  }, []);

  return (
    <SubtitleStylesContext.Provider value={{ styles, setStyles, updateStyle, resetStyles }}>
      {children}
    </SubtitleStylesContext.Provider>
  );
}

function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  disabled = false,
}: {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  return (
    <div
      className={cn(
        "inline-flex max-w-full rounded-md border border-border/70 bg-muted/30 p-0.5",
        disabled && "pointer-events-none opacity-40",
      )}
      role="group"
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          disabled={disabled}
          onClick={() => onChange(option.value)}
          className={cn(
            "rounded-[5px] px-2 py-0.5 text-[11px] font-medium leading-5 transition-colors",
            value === option.value
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function SettingRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 px-2 py-1.5">
      <span className="shrink-0 text-xs text-muted-foreground">{label}</span>
      <div className="min-w-0 text-right">{children}</div>
    </div>
  );
}

function SubtitlePreview({ styles }: { styles: SubtitleStyles }) {
  const preview = previewSubtitleStyles(styles);

  return (
    <div className="relative h-12 overflow-hidden rounded-md bg-black">
      <div className="absolute inset-x-0 bottom-2 flex justify-center px-3">
        <p
          className="max-w-full truncate text-center leading-tight"
          style={{
            color: preview.color,
            backgroundColor: preview.backgroundColor,
            fontSize: "0.8rem",
            fontFamily: preview.fontFamily,
            textShadow: preview.textShadow,
            padding:
              styles.background === "none" || styles.backgroundOpacity === "0"
                ? "0"
                : "0.1em 0.4em",
            borderRadius: "0.15em",
          }}
        >
          Sample subtitle
        </p>
      </div>
    </div>
  );
}

export function DesktopSubtitleAppearancePanel({ onBack }: { onBack: () => void }) {
  const { styles, setStyles, updateStyle, resetStyles } = useSubtitleStyles();

  return (
    <div className="w-72">
      <button
        type="button"
        className="flex w-full items-center gap-1 rounded px-2 py-1.5 text-left text-sm hover:bg-muted"
        onClick={onBack}
      >
        <ChevronLeft className="h-4 w-4 shrink-0 opacity-70" />
        Subtitles
      </button>

      <div className="my-1 border-t border-border" />

      <div className="px-2 pb-1">
        <SubtitlePreview styles={styles} />
      </div>

      <div className="max-h-[min(50vh,20rem)] overflow-y-auto">
        <SettingRow label="Size">
          <SegmentedControl
            options={SIZE_SEGMENTS}
            value={styles.size}
            onChange={(value) => updateStyle("size", value)}
          />
        </SettingRow>

        <SettingRow label="Font">
          <SegmentedControl
            options={FONT_SEGMENTS}
            value={styles.font}
            onChange={(value) => updateStyle("font", value)}
          />
        </SettingRow>

        <div className="px-2 py-1.5">
          <span className="text-xs text-muted-foreground">Color</span>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {SUBTITLE_COLOR_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                title={option.label}
                aria-label={option.label}
                onClick={() => updateStyle("color", option.value)}
                className={cn(
                  "h-5 w-5 rounded-full border-2 transition-transform hover:scale-105",
                  styles.color === option.value
                    ? "border-primary ring-2 ring-primary/30"
                    : "border-white/20",
                )}
                style={{ backgroundColor: SUBTITLE_SWATCH_COLORS[option.value] }}
              />
            ))}
          </div>
        </div>

        <SettingRow label="Opacity">
          <SegmentedControl
            options={OPACITY_SEGMENTS}
            value={styles.opacity}
            onChange={(value) => updateStyle("opacity", value)}
          />
        </SettingRow>

        <SettingRow label="Background">
          <SegmentedControl
            options={SUBTITLE_BACKGROUND_OPTIONS}
            value={styles.background}
            onChange={(value) => {
              const next = { ...styles, background: value };
              if (value === "none") {
                next.backgroundOpacity = "0";
              } else if (styles.backgroundOpacity === "0") {
                next.backgroundOpacity = "75";
              }
              setStyles(next);
            }}
          />
        </SettingRow>

        <SettingRow label="BG opacity">
          <SegmentedControl
            options={BG_OPACITY_SEGMENTS}
            value={styles.backgroundOpacity}
            onChange={(value) => updateStyle("backgroundOpacity", value)}
            disabled={styles.background === "none"}
          />
        </SettingRow>

        <SettingRow label="Edge">
          <SegmentedControl
            options={EDGE_SEGMENTS}
            value={styles.edge}
            onChange={(value) => updateStyle("edge", value)}
          />
        </SettingRow>
      </div>

      <div className="mt-1 border-t border-border px-1 pt-1">
        <button
          type="button"
          className="w-full rounded px-2 py-1.5 text-left text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
          onClick={resetStyles}
        >
          Reset to defaults
        </button>
      </div>
    </div>
  );
}

function TvSubtitleVerticalOptions<T extends string>({
  label,
  options,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  return (
    <>
      <TvWatchMenuSectionLabel>{label}</TvWatchMenuSectionLabel>
      {options.map((option) => (
        <TvFocusButton
          key={option.value}
          variant="card"
          selected={value === option.value}
          disabled={disabled}
          onClick={() => onChange(option.value)}
          className={tvWatchMenuOptionClassName()}
        >
          {option.label}
        </TvFocusButton>
      ))}
    </>
  );
}

export function TvSubtitleAppearancePanel({
  nativePlayback = false,
}: {
  nativePlayback?: boolean;
}) {
  const { styles, setStyles, updateStyle, resetStyles } = useSubtitleStyles();
  const preview = previewSubtitleStyles(styles);

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-xl border border-white/10 bg-black">
        <div className="relative aspect-[16/5] bg-gradient-to-b from-zinc-900 to-black">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_20%,rgba(255,255,255,0.08),transparent_55%)]" />
          <div className="absolute inset-x-0 bottom-[18%] flex justify-center px-6">
            <p
              className="max-w-xl text-center leading-snug"
              style={{
                color: preview.color,
                backgroundColor: preview.backgroundColor,
                fontSize: preview.fontSize,
                fontFamily: preview.fontFamily,
                textShadow: preview.textShadow,
                padding:
                  styles.background === "none" || styles.backgroundOpacity === "0"
                    ? "0"
                    : "0.2em 0.55em",
                borderRadius: "0.2em",
              }}
            >
              Sample subtitle preview
            </p>
          </div>
        </div>
      </div>

      {nativePlayback && !nativeSubtitleStylesAvailable() ? (
        <p className="px-1 text-sm leading-relaxed text-muted-foreground">
          Update the TV app to customize subtitle appearance during native playback.
        </p>
      ) : null}

      <TvWatchMenuList>
        <TvSubtitleVerticalOptions
          label="Text size"
          options={SUBTITLE_SIZE_OPTIONS}
          value={styles.size}
          onChange={(value) => updateStyle("size", value)}
        />

        <TvSubtitleVerticalOptions
          label="Font"
          options={SUBTITLE_FONT_OPTIONS}
          value={styles.font}
          onChange={(value) => updateStyle("font", value)}
        />

        <TvSubtitleVerticalOptions
          label="Text color"
          options={SUBTITLE_COLOR_OPTIONS}
          value={styles.color}
          onChange={(value) => updateStyle("color", value)}
        />

        <TvSubtitleVerticalOptions
          label="Text opacity"
          options={SUBTITLE_OPACITY_OPTIONS}
          value={styles.opacity}
          onChange={(value) => updateStyle("opacity", value)}
        />

        <TvSubtitleVerticalOptions
          label="Background"
          options={SUBTITLE_BACKGROUND_OPTIONS}
          value={styles.background}
          onChange={(value) => {
            const next = { ...styles, background: value };
            if (value === "none") {
              next.backgroundOpacity = "0";
            } else if (styles.backgroundOpacity === "0") {
              next.backgroundOpacity = "75";
            }
            setStyles(next);
          }}
        />

        <TvSubtitleVerticalOptions
          label="Background opacity"
          options={SUBTITLE_BACKGROUND_OPACITY_OPTIONS}
          value={styles.backgroundOpacity}
          onChange={(value) => updateStyle("backgroundOpacity", value)}
          disabled={styles.background === "none"}
        />

        <TvSubtitleVerticalOptions
          label="Text edge style"
          options={SUBTITLE_EDGE_OPTIONS}
          value={styles.edge}
          onChange={(value) => updateStyle("edge", value)}
        />

        <TvWatchMenuSectionLabel>Actions</TvWatchMenuSectionLabel>
        <TvFocusButton
          variant="card"
          onClick={resetStyles}
          className={tvWatchMenuOptionClassName()}
        >
          Reset to defaults
        </TvFocusButton>
      </TvWatchMenuList>
    </div>
  );
}
