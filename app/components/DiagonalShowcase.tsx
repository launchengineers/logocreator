"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { useTheme } from "next-themes";
import { SHOWCASE } from "@/app/lib/showcase";

const ROWS = 4;
const ROW_CONFIG = [
  { dir: "marquee-left", dur: "46s" },
  { dir: "marquee-right", dur: "58s" },
  { dir: "marquee-left", dur: "52s" },
  { dir: "marquee-right", dur: "64s" },
];

function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = Array.from({ length: n }, () => []);
  arr.forEach((item, i) => out[i % n].push(item));
  return out;
}

/**
 * Animated background for the WelcomeModal: rows of example-brand logo cards
 * scrolling in alternating directions, tilted diagonally, with a vignette so
 * the foreground copy stays legible. Decorative + non-interactive.
 */
export default function DiagonalShowcase() {
  const rows = chunk(SHOWCASE, ROWS);
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  // In dark mode use the dark-background variants (<slug>-dark.png) so the wall
  // matches the theme instead of glowing white.
  const dark = mounted && resolvedTheme === "dark";
  const srcFor = (src: string) =>
    dark ? src.replace(/\.png$/, "-dark.png") : src;

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      <div
        className="absolute inset-[-25%] flex flex-col justify-center gap-4 opacity-[0.85]"
        style={{ transform: "rotate(-12deg)" }}
      >
        {rows.map((row, i) => {
          const cfg = ROW_CONFIG[i % ROW_CONFIG.length];
          const tiles = [...row, ...row]; // duplicate → seamless -50% loop
          return (
            <div key={i} className="flex">
              <div
                className={`marquee-track flex gap-4 ${cfg.dir}`}
                style={{ "--marquee-dur": cfg.dur } as CSSProperties}
              >
                {tiles.map((logo, j) => (
                  <div
                    key={`${i}-${j}`}
                    className="flex size-28 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-border bg-card shadow-sm"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={srcFor(logo.src)}
                      alt=""
                      loading="lazy"
                      draggable={false}
                      onError={(e) => {
                        const tile = e.currentTarget.parentElement;
                        if (tile) tile.style.display = "none";
                      }}
                      className="size-full object-contain p-2"
                    />
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Vignette so cards fade out toward the edges + behind the copy. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 38%, hsl(var(--background) / 0.32) 75%, hsl(var(--background) / 0.72) 100%)",
        }}
      />
    </div>
  );
}
