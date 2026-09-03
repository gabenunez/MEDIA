import { forwardRef } from "react";
import Image, { type ImageProps } from "next/image";
import { shouldSkipImageOptimizer } from "@/lib/next-image-url";
import { cn } from "@/lib/utils";

type MediaImageProps = Omit<ImageProps, "src" | "alt"> & {
  src: string | null | undefined;
  alt?: string;
};

/** Poster, backdrop, and still artwork via the Next.js image optimizer. */
export const MediaImage = forwardRef<HTMLImageElement, MediaImageProps>(
  function MediaImage(
    {
      src,
      alt = "",
      className,
      priority,
      fill,
      loading,
      quality = 80,
      sizes,
      unoptimized,
      ...props
    },
    ref,
  ) {
    if (!src) return null;

    const loadingProp = priority ? undefined : (loading ?? "lazy");
    const skipOptimizer = unoptimized ?? shouldSkipImageOptimizer(src);
    const fetchPriorityProp = priority ? "high" : loadingProp === "eager" ? "low" : undefined;

    if (fill) {
      return (
        <Image
          ref={ref}
          src={src}
          alt={alt}
          fill
          priority={priority}
          loading={loadingProp}
          quality={quality}
          sizes={sizes ?? "100vw"}
          unoptimized={skipOptimizer}
          fetchPriority={fetchPriorityProp}
          className={cn(className)}
          {...props}
        />
      );
    }

    return (
      <Image
        ref={ref}
        src={src}
        alt={alt}
        priority={priority}
        loading={loadingProp}
        quality={quality}
        sizes={sizes}
        unoptimized={skipOptimizer}
        fetchPriority={fetchPriorityProp}
        className={cn(className)}
        {...props}
      />
    );
  },
);
