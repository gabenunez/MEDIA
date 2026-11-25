import {
  Expand,
  ListVideo,
  Loader2,
  Proportions,
  Settings2,
  StretchHorizontal,
  Subtitles,
} from "lucide-react";

const outlineIcons = {
  buffering: Loader2,
  chapters: ListVideo,
  fit: Proportions,
  fill: Expand,
  quality: Settings2,
  stretch: StretchHorizontal,
  subtitles: Subtitles,
};

type TvWatchIconProps =
  | { icon: keyof typeof outlineIcons | "restart" | "play" | "pause" }
  | { icon: "back" | "forward"; seconds: number };

export function TvWatchIcon(props: TvWatchIconProps) {
  const { icon } = props;
  if (icon === "back" || icon === "forward") {
    return (
      <svg className="tv-watch-icon" viewBox="0 0 32 32" aria-hidden="true">
        <path
          d="M5 19a11 11 0 1 0 3-11M8 2v6h6"
          transform={icon === "forward" ? "translate(32 0) scale(-1 1)" : undefined}
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <text
          x="16"
          y="21"
          textAnchor="middle"
          fontSize="11"
          fontWeight="700"
          fill="currentColor"
        >
          {props.seconds}
        </text>
      </svg>
    );
  }

  if (icon === "restart" || icon === "play" || icon === "pause") {
    return (
      <svg className="tv-watch-icon" viewBox="0 0 32 32" fill="currentColor" aria-hidden="true">
        {icon === "pause" ? (
          <>
            <rect x="8" y="5" width="6" height="22" rx="1.5" />
            <rect x="18" y="5" width="6" height="22" rx="1.5" />
          </>
        ) : icon === "play" ? (
          <path d="M10 6a1 1 0 0 1 1.5-.9l17 10a1 1 0 0 1 0 1.8l-17 10A1 1 0 0 1 10 26Z" />
        ) : (
          <>
            <rect x="5" y="6" width="3" height="20" rx="1.5" />
            <path d="M26 7a1 1 0 0 0-1.5-.9l-14 9a1 1 0 0 0 0 1.8l14 9A1 1 0 0 0 26 25Z" />
          </>
        )}
      </svg>
    );
  }

  const Icon = outlineIcons[icon];
  const glyph = <Icon className="tv-watch-icon" strokeWidth={2.25} aria-hidden="true" />;
  return icon === "buffering" ? (
    <span className="motion-safe:animate-spin">{glyph}</span>
  ) : glyph;
}
