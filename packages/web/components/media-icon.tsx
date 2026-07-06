import { cn } from "@/lib/utils";

const markProps = {
  fill: "#2fffe5",
  fontSize: 11.5,
  fontWeight: 900 as const,
  fontFamily: "system-ui, sans-serif",
};

export function MediaIcon({
  className,
  background = true,
}: {
  className?: string;
  /** Rounded tile behind the mark — off for TV sidebar where the rail is the backdrop. */
  background?: boolean;
}) {
  if (!background) {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 20 14"
        fill="none"
        className={cn("block shrink-0 overflow-visible", className)}
        aria-hidden
      >
        <text x="5.5" y="7" textAnchor="middle" dominantBaseline="central" {...markProps}>
          M
        </text>
        <g className="origin-[13.5px_7px] transition-transform duration-200 ease-out motion-reduce:transition-none md:group-hover:-translate-y-px">
          <text x="13.5" y="7" textAnchor="middle" dominantBaseline="central" {...markProps}>
            !
          </text>
        </g>
      </svg>
    );
  }

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 32 32"
      fill="none"
      className={cn("block shrink-0", className)}
      aria-hidden
    >
      <rect x="6" y="6" width="20" height="20" rx="5" fill="#0c1415" />
      <text x="12.5" y="19.5" textAnchor="middle" {...markProps}>
        M
      </text>
      <g className="origin-[20.5px_19.5px] transition-transform duration-200 ease-out motion-reduce:transition-none md:group-hover:-translate-y-1">
        <text x="20.5" y="19.5" textAnchor="middle" {...markProps}>
          !
        </text>
      </g>
    </svg>
  );
}
