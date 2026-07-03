import { Skeleton } from "@/components/ui/skeleton";
import { ScrollRow } from "@/components/scroll-row";

export function PosterRowSkeleton({
  count = 6,
  wide = false,
}: {
  count?: number;
  wide?: boolean;
}) {
  return (
    <ScrollRow
      contentClassName="px-4 sm:px-6"
      className="mx-auto max-w-7xl"
    >
      {Array.from({ length: count }).map((_, index) => (
        <div
          key={index}
          className={wide ? "w-44 shrink-0 snap-start sm:w-56" : "w-36 shrink-0 snap-start sm:w-44"}
        >
          <Skeleton className="aspect-[2/3] w-full rounded-md" />
          {wide && <Skeleton className="mt-2 h-3 w-24 rounded" />}
        </div>
      ))}
    </ScrollRow>
  );
}
