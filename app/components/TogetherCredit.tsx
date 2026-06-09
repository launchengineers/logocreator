/* eslint-disable @next/next/no-img-element */
import { cn } from "@/lib/utils";

/** "Powered by" + the official together.ai lockup (dark on light theme, white on dark). */
export default function TogetherCredit({ className }: { className?: string }) {
  return (
    <a
      href="https://togetherai.link/"
      target="_blank"
      rel="noreferrer"
      aria-label="Powered by Together AI"
      className={cn(
        "inline-flex items-center gap-2 transition-opacity hover:opacity-70",
        className,
      )}
    >
      <span className="text-xs text-muted-foreground">Powered by</span>
      <img
        src="/together-logo-light.png"
        alt="together.ai"
        className="h-[1.15rem] w-auto dark:hidden"
      />
      <img
        src="/together-logo-dark.png"
        alt="together.ai"
        className="hidden h-[1.15rem] w-auto dark:block"
      />
    </a>
  );
}
