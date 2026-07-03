export type SubtitleSize = "small" | "medium" | "large" | "extra-large";
export type SubtitleFont = "default" | "serif" | "monospace";
export type SubtitleColor =
  | "white"
  | "yellow"
  | "green"
  | "cyan"
  | "blue"
  | "magenta"
  | "red"
  | "black";
export type SubtitleOpacity = "25" | "50" | "75" | "100";
export type SubtitleBackground = "none" | "black" | "white";
export type SubtitleBackgroundOpacity = "0" | "25" | "50" | "75" | "100";
export type SubtitleEdge = "none" | "drop-shadow" | "outline";

export interface SubtitleStyles {
  size: SubtitleSize;
  font: SubtitleFont;
  color: SubtitleColor;
  opacity: SubtitleOpacity;
  background: SubtitleBackground;
  backgroundOpacity: SubtitleBackgroundOpacity;
  edge: SubtitleEdge;
}

export const SUBTITLE_STYLES_KEY = "reel-subtitle-styles";
export const SUBTITLE_STYLES_CHANGED_EVENT = "reel-subtitle-styles-changed";

export const DEFAULT_SUBTITLE_STYLES: SubtitleStyles = {
  size: "medium",
  font: "default",
  color: "white",
  opacity: "100",
  background: "black",
  backgroundOpacity: "75",
  edge: "none",
};

const COLOR_RGB: Record<SubtitleColor, [number, number, number]> = {
  white: [255, 255, 255],
  yellow: [255, 235, 59],
  green: [118, 255, 122],
  cyan: [77, 232, 255],
  blue: [130, 170, 255],
  magenta: [255, 128, 255],
  red: [255, 107, 107],
  black: [0, 0, 0],
};

const SIZE_EM: Record<SubtitleSize, string> = {
  small: "0.9em",
  medium: "1.05em",
  large: "1.3em",
  "extra-large": "1.6em",
};

const FONT_FAMILY: Record<SubtitleFont, string> = {
  default: 'system-ui, -apple-system, "Segoe UI", sans-serif',
  serif: 'ui-serif, "Iowan Old Style", "Palatino Linotype", serif',
  monospace: 'ui-monospace, "SFMono-Regular", Menlo, monospace',
};

const EDGE_SHADOW: Record<SubtitleEdge, string> = {
  none: "none",
  "drop-shadow": "2px 2px 3px rgba(0, 0, 0, 0.9)",
  outline:
    "rgb(0 0 0) -1px -1px 0, rgb(0 0 0) 1px -1px 0, rgb(0 0 0) -1px 1px 0, rgb(0 0 0) 1px 1px 0",
};

function rgba(color: SubtitleColor, opacityPercent: string): string {
  const [r, g, b] = COLOR_RGB[color];
  const alpha = parseInt(opacityPercent, 10) / 100;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function cueBackground(styles: SubtitleStyles): string {
  if (styles.background === "none" || styles.backgroundOpacity === "0") {
    return "transparent";
  }
  return rgba(styles.background, styles.backgroundOpacity);
}

function isSubtitleStyles(value: unknown): value is SubtitleStyles {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<SubtitleStyles>;
  return (
    typeof candidate.size === "string" &&
    typeof candidate.font === "string" &&
    typeof candidate.color === "string" &&
    typeof candidate.opacity === "string" &&
    typeof candidate.background === "string" &&
    typeof candidate.backgroundOpacity === "string" &&
    typeof candidate.edge === "string"
  );
}

export function readSubtitleStyles(): SubtitleStyles {
  if (typeof window === "undefined") return DEFAULT_SUBTITLE_STYLES;

  try {
    const raw = localStorage.getItem(SUBTITLE_STYLES_KEY);
    if (!raw) return DEFAULT_SUBTITLE_STYLES;
    const parsed = JSON.parse(raw) as unknown;
    if (!isSubtitleStyles(parsed)) return DEFAULT_SUBTITLE_STYLES;
    return { ...DEFAULT_SUBTITLE_STYLES, ...parsed };
  } catch {
    return DEFAULT_SUBTITLE_STYLES;
  }
}

export function writeSubtitleStyles(styles: SubtitleStyles): void {
  localStorage.setItem(SUBTITLE_STYLES_KEY, JSON.stringify(styles));
  window.dispatchEvent(new Event(SUBTITLE_STYLES_CHANGED_EVENT));
}

export function applySubtitleStyles(styles: SubtitleStyles): void {
  if (typeof document === "undefined") return;

  const root = document.documentElement;
  root.style.setProperty("--subtitle-cue-size", SIZE_EM[styles.size]);
  root.style.setProperty("--subtitle-cue-font", FONT_FAMILY[styles.font]);
  root.style.setProperty("--subtitle-cue-color", rgba(styles.color, styles.opacity));
  root.style.setProperty("--subtitle-cue-background", cueBackground(styles));
  root.style.setProperty("--subtitle-cue-shadow", EDGE_SHADOW[styles.edge]);
}

export function previewSubtitleStyles(styles: SubtitleStyles): {
  color: string;
  backgroundColor: string;
  fontSize: string;
  fontFamily: string;
  textShadow: string;
} {
  const previewScale: Record<SubtitleSize, string> = {
    small: "0.85rem",
    medium: "1rem",
    large: "1.2rem",
    "extra-large": "1.45rem",
  };

  return {
    color: rgba(styles.color, styles.opacity),
    backgroundColor: cueBackground(styles),
    fontSize: previewScale[styles.size],
    fontFamily: FONT_FAMILY[styles.font],
    textShadow: EDGE_SHADOW[styles.edge],
  };
}

export const SUBTITLE_SIZE_OPTIONS: Array<{ value: SubtitleSize; label: string }> = [
  { value: "small", label: "Small" },
  { value: "medium", label: "Medium" },
  { value: "large", label: "Large" },
  { value: "extra-large", label: "Extra Large" },
];

export const SUBTITLE_FONT_OPTIONS: Array<{ value: SubtitleFont; label: string }> = [
  { value: "default", label: "Default" },
  { value: "serif", label: "Serif" },
  { value: "monospace", label: "Monospace" },
];

export const SUBTITLE_COLOR_OPTIONS: Array<{ value: SubtitleColor; label: string }> = [
  { value: "white", label: "White" },
  { value: "yellow", label: "Yellow" },
  { value: "green", label: "Green" },
  { value: "cyan", label: "Cyan" },
  { value: "blue", label: "Blue" },
  { value: "magenta", label: "Magenta" },
  { value: "red", label: "Red" },
  { value: "black", label: "Black" },
];

export const SUBTITLE_OPACITY_OPTIONS: Array<{ value: SubtitleOpacity; label: string }> = [
  { value: "100", label: "100%" },
  { value: "75", label: "75%" },
  { value: "50", label: "50%" },
  { value: "25", label: "25%" },
];

export const SUBTITLE_BACKGROUND_OPTIONS: Array<{ value: SubtitleBackground; label: string }> =
  [
    { value: "none", label: "None" },
    { value: "black", label: "Black" },
    { value: "white", label: "White" },
  ];

export const SUBTITLE_BACKGROUND_OPACITY_OPTIONS: Array<{
  value: SubtitleBackgroundOpacity;
  label: string;
}> = [
  { value: "100", label: "100%" },
  { value: "75", label: "75%" },
  { value: "50", label: "50%" },
  { value: "25", label: "25%" },
  { value: "0", label: "0%" },
];

export const SUBTITLE_EDGE_OPTIONS: Array<{ value: SubtitleEdge; label: string }> = [
  { value: "none", label: "None" },
  { value: "drop-shadow", label: "Drop Shadow" },
  { value: "outline", label: "Outline" },
];
