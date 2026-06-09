"use client";

import { cn } from "@/lib/utils";

export default function Segmented({
  options,
  value,
  onChange,
  className,
  ariaLabel,
}: {
  options: readonly string[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <div
      className={cn(
        "flex w-full rounded-lg border border-border bg-background p-0.5",
        className,
      )}
      role="radiogroup"
      aria-label={ariaLabel}
    >
      {options.map((option) => {
        const active = option === value;
        return (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option)}
            className={cn(
              "flex-1 rounded-[0.4rem] px-2 py-1.5 text-xs font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
              active
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {option}
          </button>
        );
      })}
    </div>
  );
}
