"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Plus, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

export const AUTO_COLOR = "auto";

type Swatch = { name: string; color: string };

// A curated brand-color grid for the "+" popover (more than fits in the row).
const PALETTE: string[] = [
  "#2F6FF5", "#19337A", "#0EA5E9", "#14B8A6",
  "#30A46C", "#84CC16", "#F2C40F", "#E2682A",
  "#E5484D", "#D9488C", "#7C4DFF", "#9333EA",
  "#0F172A", "#475569", "#9CA3AF", "#FFFFFF",
];

// Perceived lightness, to choose a legible check-mark color on each swatch.
function isLight(hex: string): boolean {
  const h = hex.replace("#", "");
  if (h.length < 6) return true;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return 0.299 * r + 0.587 * g + 0.114 * b > 150;
}

function normalizeHex(input: string): string | null {
  let h = input.trim().replace(/^#/, "");
  if (/^[0-9a-fA-F]{3}$/.test(h)) {
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  }
  return /^[0-9a-fA-F]{6}$/.test(h) ? `#${h.toUpperCase()}` : null;
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
  const isAuto = value === AUTO_COLOR;
  const v = value.toLowerCase();
  const matchedPreset = presets.some((p) => p.color.toLowerCase() === v);
  const customSelected = !isAuto && !matchedPreset;

  const [open, setOpen] = useState(false);
  const [hexDraft, setHexDraft] = useState("");
  const popRef = useRef<HTMLDivElement>(null);

  // Close the popover on outside click or Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const ring =
    "ring-offset-2 ring-offset-background transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

  return (
    <div className="min-w-0">
      <span className="label-eyebrow mb-2 block">{label}</span>
      <div className="flex items-center gap-2">
        {/* Auto: let the AI choose a fitting color */}
        <button
          type="button"
          title="Auto : let AI choose"
          aria-label={`Auto ${label.toLowerCase()} : let AI choose`}
          aria-pressed={isAuto}
          onClick={() => onChange(AUTO_COLOR)}
          className={cn(
            "relative flex size-7 items-center justify-center rounded-full bg-secondary",
            ring,
            isAuto ? "ring-2 ring-foreground" : "ring-1 ring-foreground/30 hover:ring-foreground/55",
          )}
        >
          <Sparkles
            className={cn(
              "size-3.5",
              isAuto ? "text-foreground" : "text-muted-foreground",
            )}
          />
        </button>

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
                "relative flex size-7 items-center justify-center rounded-full",
                ring,
                selected ? "ring-2 ring-foreground" : "ring-1 ring-foreground/30 hover:ring-foreground/55",
              )}
            >
              {selected && (
                <Check
                  strokeWidth={3.5}
                  className={cn("size-3.5", isLight(swatch.color) ? "text-black/70" : "text-white")}
                />
              )}
            </button>
          );
        })}

        {/* Custom: opens a popover with a curated grid + hex input */}
        <div className="relative" ref={popRef}>
          <button
            type="button"
            title="More colors"
            aria-label={`Pick a custom ${label.toLowerCase()}`}
            aria-haspopup="dialog"
            aria-expanded={open}
            onClick={() => {
              setHexDraft(customSelected ? value.replace(/^#/, "") : "");
              setOpen((o) => !o);
            }}
            className={cn(
              "relative flex size-7 items-center justify-center overflow-hidden rounded-full",
              ring,
              customSelected ? "ring-2 ring-foreground" : "ring-1 ring-foreground/30 hover:ring-foreground/55",
            )}
            style={customSelected ? { backgroundColor: value } : undefined}
          >
            {customSelected ? (
              <Check
                strokeWidth={3.5}
                className={cn("size-3.5", isLight(value) ? "text-black/70" : "text-white")}
              />
            ) : (
              <Plus className="size-3.5 text-muted-foreground" />
            )}
          </button>

          {open && (
            <div
              role="dialog"
              aria-label={`${label} colors`}
              className="absolute left-0 top-9 z-50 w-56 rounded-xl border border-border bg-popover p-3 shadow-xl"
            >
              <div className="grid grid-cols-8 gap-1.5">
                {PALETTE.map((hex) => {
                  const selected = hex.toLowerCase() === v;
                  return (
                    <button
                      key={hex}
                      type="button"
                      title={hex}
                      aria-label={hex}
                      onClick={() => {
                        onChange(hex);
                        setOpen(false);
                      }}
                      style={{ backgroundColor: hex }}
                      className={cn(
                        "flex size-5 items-center justify-center rounded-full ring-offset-1 ring-offset-popover",
                        selected
                          ? "ring-2 ring-foreground"
                          : "ring-1 ring-foreground/15 hover:ring-foreground/50",
                      )}
                    >
                      {selected && (
                        <Check
                          strokeWidth={3.5}
                          className={cn("size-3", isLight(hex) ? "text-black/70" : "text-white")}
                        />
                      )}
                    </button>
                  );
                })}
              </div>

              <div className="mt-3 flex items-center gap-2">
                <div className="flex flex-1 items-center rounded-lg border border-input bg-background px-2">
                  <span className="text-sm text-muted-foreground">#</span>
                  <input
                    value={hexDraft}
                    onChange={(e) => setHexDraft(e.target.value.replace(/[^0-9a-fA-F]/g, "").slice(0, 6))}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        const norm = normalizeHex(hexDraft);
                        if (norm) {
                          onChange(norm);
                          setOpen(false);
                        }
                      }
                    }}
                    placeholder="2F6FF5"
                    aria-label={`${label} hex code`}
                    autoFocus
                    className="w-full bg-transparent py-1.5 text-sm uppercase outline-none placeholder:text-muted-foreground/60"
                  />
                </div>
                <label
                  title="System color picker"
                  className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-input"
                  style={{
                    background:
                      "conic-gradient(from 90deg, #ff5d5d, #f6c544, #36c46a, #2f6ff5, #a855f7, #ff5d5d)",
                  }}
                >
                  <input
                    type="color"
                    value={customSelected ? value : "#2F6FF5"}
                    onChange={(e) => onChange(e.target.value)}
                    aria-label={`System ${label.toLowerCase()} picker`}
                    className="absolute size-0 opacity-0"
                  />
                </label>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
