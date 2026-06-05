import { cn } from "@/lib/utils";

/**
 * The LogoCreator mark: two offset rounded "canvases" (the act of generating
 * logo variations) with the accent card peeking through a lens cut in the front.
 * Themes automatically — the front card is `currentColor`, the back is the accent.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      className={cn("text-foreground", className)}
    >
      {/* Back canvas — the accent, peeking out top-left and through the lens */}
      <rect x="3.5" y="4.5" width="18.5" height="18.5" rx="5.5" className="fill-primary" />
      <mask
        id="lc-lens"
        maskUnits="userSpaceOnUse"
        x="9"
        y="8"
        width="19"
        height="19"
      >
        <rect x="9.5" y="8.5" width="18.5" height="18.5" rx="5.5" fill="white" />
        <circle cx="18.75" cy="17.75" r="3.9" fill="black" />
      </mask>
      {/* Front canvas — foreground, with the lens cut */}
      <rect
        x="9.5"
        y="8.5"
        width="18.5"
        height="18.5"
        rx="5.5"
        fill="currentColor"
        mask="url(#lc-lens)"
      />
    </svg>
  );
}

export default function Logo({
  className,
  markClassName,
  wordmark = true,
}: {
  className?: string;
  markClassName?: string;
  wordmark?: boolean;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark className={cn("size-7 shrink-0", markClassName)} />
      {wordmark && (
        <span className="text-[1.0625rem] font-bold leading-none tracking-[-0.02em] text-foreground">
          LogoCreator
        </span>
      )}
    </span>
  );
}
