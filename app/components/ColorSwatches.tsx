"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

type Swatch = { name: string; color: string };

// Perceived lightness, to choose a legible check-mark color on each swatch.
function isLight(hex: string): boolean {
  const h = hex.replace("#", "");
  if (h.length < 6) return true;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return 0.299 * r + 0.587 * g + 0.114 * b > 150;
}

export default function ColorSwatches({
  label,
  presets,
  value,
  onChange,
}: {
  label: string;
  presets: Swatch[];
  value: string;
  onChange: (hex: string) => void;
}) {
  const v = value.toLowerCase();
  const matchedPreset = presets.some((p) => p.color.toLowerCase() === v);

  return (
    <div className="min-w-0">
      <span className="label-eyebrow mb-2 block">{label}</span>
      <div className="flex items-center gap-2">
        {presets.map((swatch) => {
          const selected = swatch.color.toLowerCase() === v;
          return (
            <button
              key={swatch.name}
              type="button"
              title={swatch.name}
              aria-label={swatch.name}
              aria-pressed={selected}
              onClick={() => onChange(swatch.color)}
              style={{ backgroundColor: swatch.color }}
              className={cn(
                "relative flex size-7 items-center justify-center rounded-full ring-offset-2 ring-offset-background transition-all duration-150",
                selected
                  ? "ring-2 ring-foreground"
                  : "ring-1 ring-foreground/30 hover:ring-foreground/55",
              )}
            >
              {selected && (
                <Check
                  strokeWidth={3.5}
                  className={cn(
                    "size-3.5",
                    isLight(swatch.color) ? "text-black/70" : "text-white",
                  )}
                />
              )}
            </button>
          );
        })}

        {/* Custom color — opens the native picker */}
        <label
          title="Custom color"
          className={cn(
            "relative flex size-7 cursor-pointer items-center justify-center overflow-hidden rounded-full ring-offset-2 ring-offset-background transition-all duration-150",
            !matchedPreset
              ? "ring-2 ring-foreground"
              : "ring-1 ring-foreground/30 hover:ring-foreground/55",
          )}
          style={!matchedPreset ? { backgroundColor: value } : undefined}
        >
          {matchedPreset ? (
            <span
              className="size-full"
              style={{
                background:
                  "conic-gradient(from 90deg, #ff5d5d, #f6c544, #36c46a, #2f6ff5, #a855f7, #ff5d5d)",
              }}
            />
          ) : (
            <Check
              strokeWidth={3.5}
              className={cn(
                "size-3.5",
                isLight(value) ? "text-black/70" : "text-white",
              )}
            />
          )}
          <input
            type="color"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            aria-label={`Custom ${label.toLowerCase()} color`}
            className="absolute inset-0 cursor-pointer opacity-0"
          />
        </label>
      </div>
    </div>
  );
}
