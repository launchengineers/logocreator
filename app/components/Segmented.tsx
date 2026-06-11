"use client";

import { useRef } from "react";
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
  const btnRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const activeIdx = Math.max(0, options.indexOf(value));

  // WAI-ARIA radiogroup keyboard pattern: one Tab stop (the selected option),
  // arrows move + select with wrap-around, Home/End jump to the edges.
  function onKeyDown(e: React.KeyboardEvent) {
    let next: number | null = null;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      next = (activeIdx + 1) % options.length;
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      next = (activeIdx - 1 + options.length) % options.length;
    } else if (e.key === "Home") {
      next = 0;
    } else if (e.key === "End") {
      next = options.length - 1;
    }
    if (next === null) return;
    e.preventDefault();
    onChange(options[next]);
    btnRefs.current[next]?.focus();
  }

  return (
    <div
      className={cn(
        "flex w-full rounded-lg border border-border bg-background p-0.5",
        className,
      )}
      role="radiogroup"
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
    >
      {options.map((option, i) => {
        const active = i === activeIdx;
        return (
          <button
            key={option}
            ref={(el) => {
              btnRefs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
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
