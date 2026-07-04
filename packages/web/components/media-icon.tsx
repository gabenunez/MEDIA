import { cn } from "@/lib/utils";

export function MediaIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 32 32"
      fill="none"
      className={cn("shrink-0", className)}
      aria-hidden
    >
      <rect width="32" height="32" rx="7" fill="#0c1415" />
      <text
        x="16"
        y="21"
        textAnchor="middle"
        fill="#2fffe5"
        fontSize="11"
        fontWeight="900"
        fontFamily="system-ui, sans-serif"
      >
        M!
      </text>
    </svg>
  );
}
