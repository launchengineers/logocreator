"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Globe, Loader2, Upload, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";

export type BrandImportResult = {
  name?: string | null;
  themeColor?: string | null;
  logoDataUrl?: string | null;
  source: string;
};

export type ImportedBrand = {
  source: string;
  color: string;
  name?: string | null;
  logo?: string | null;
  palette?: string[];
};

function isLight(hex: string): boolean {
  const h = hex.replace("#", "");
  if (h.length < 6) return true;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return 0.299 * r + 0.587 * g + 0.114 * b > 150;
}

/**
 * "Start from your brand": paste a website URL (server pulls the name, accent
 * color + logo) or drop in a logo image (colors read on-device). After import,
 * the field collapses into a compact pill (logo + source + a color dot you can
 * re-pick from the detected palette). No vision model, no credits.
 */
export default function BrandImport({
  onResult,
  imported,
  onClear,
  onPickColor,
  disabled,
}: {
  onResult: (r: BrandImportResult) => void | Promise<void>;
  imported: ImportedBrand | null;
  onClear: () => void;
  onPickColor: (hex: string) => void;
  disabled?: boolean;
}) {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState<false | "url" | "file">(false);
  const [pickOpen, setPickOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const busy = disabled || loading !== false;

  // Close the color picker on outside click / Escape.
  useEffect(() => {
    if (!pickOpen) return;
    const onDown = (e: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node)) {
        setPickOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setPickOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [pickOpen]);

  async function importUrl() {
    const u = url.trim();
    if (!u || busy) return;
    setLoading("url");
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15_000);
    try {
      const res = await fetch("/api/import-brand", {
        method: "POST",
        body: JSON.stringify({ url: u }),
        signal: ctrl.signal,
      });
      if (!res.ok) {
        const msg = await res.text().catch(() => "");
        toast({
          variant: "destructive",
          title: "Couldn't import that site",
          description: msg || "Try another URL, or upload your logo instead.",
        });
        return;
      }
      const data = await res.json();
      setUrl("");
      await onResult({
        name: data.name,
        themeColor: data.themeColor,
        logoDataUrl: data.logoDataUrl,
        source: data.sourceUrl || u,
      });
    } catch (err) {
      const aborted = err instanceof DOMException && err.name === "AbortError";
      toast({
        variant: "destructive",
        title: "Couldn't import that site",
        description: aborted
          ? "That site took too long. Try another URL or upload your logo."
          : "Check the URL and try again.",
      });
    } finally {
      clearTimeout(timer);
      setLoading(false);
    }
  }

  async function importFile(file: File) {
    if (!file.type.startsWith("image/")) {
      toast({
        variant: "destructive",
        title: "Use an image file",
        description: "PNG, JPG, SVG or WebP.",
      });
      return;
    }
    if (file.size > 6 * 1024 * 1024) {
      toast({ variant: "destructive", title: "That image is too large" });
      return;
    }
    setLoading("file");
    try {
      // Same resilience as the URL path's 15s guard: a FileReader that never
      // fires would otherwise leave the spinner stuck forever.
      const dataUrl = await Promise.race([
        new Promise<string>((resolve, reject) => {
          const fr = new FileReader();
          fr.onload = () => resolve(String(fr.result));
          fr.onerror = () => reject(new Error("read"));
          fr.readAsDataURL(file);
        }),
        new Promise<string>((_, reject) =>
          setTimeout(() => reject(new Error("timeout")), 10_000),
        ),
      ]);
      await onResult({
        logoDataUrl: dataUrl,
        source: file.name.replace(/\.[^.]+$/, "") || "your logo",
      });
    } catch {
      toast({ variant: "destructive", title: "Couldn't read that image" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <span className="label-eyebrow mb-2 block">Start from your brand</span>

      {imported ? (
        // ── Imported: a compact pill that sits where the input was ──────────
        <div className="flex items-center gap-2 rounded-lg border border-primary/40 bg-primary/[0.06] py-1.5 pl-2 pr-1.5">
          {imported.logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imported.logo}
              alt=""
              className="size-6 shrink-0 rounded-md bg-background object-contain p-0.5 ring-1 ring-border"
            />
          ) : (
            <Globe className="size-4 shrink-0 text-primary" />
          )}
          <span className="min-w-0 flex-1 truncate text-sm">
            <span className="text-muted-foreground">
              {imported.name ? "Brand from " : "Colors from "}
            </span>
            <span className="font-semibold text-foreground">
              {imported.source}
            </span>
          </span>

          {/* Color dot: opens the detected-palette picker */}
          <div className="relative shrink-0" ref={popRef}>
            <button
              type="button"
              onClick={() => setPickOpen((o) => !o)}
              aria-label="Pick brand color from detected palette"
              aria-haspopup="dialog"
              aria-expanded={pickOpen}
              title={`Brand color ${imported.color} (click to re-pick)`}
              className="flex size-6 items-center justify-center rounded-full outline-none ring-offset-2 ring-offset-card focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span
                className="size-5 rounded-full ring-1 ring-foreground/20"
                style={{ backgroundColor: imported.color }}
              />
            </button>

            {pickOpen && imported.palette && imported.palette.length > 0 && (
              <div
                role="dialog"
                aria-label="Detected brand colors"
                className="absolute right-0 top-8 z-50 w-44 rounded-xl border border-border bg-popover p-2.5 shadow-xl"
              >
                <span className="label-eyebrow mb-2 block">Detected colors</span>
                <div className="grid grid-cols-6 gap-1.5">
                  {imported.palette.map((hex) => {
                    const selected = hex.toLowerCase() === imported.color.toLowerCase();
                    return (
                      <button
                        key={hex}
                        type="button"
                        title={hex}
                        aria-label={hex}
                        onClick={() => {
                          onPickColor(hex);
                          setPickOpen(false);
                        }}
                        style={{ backgroundColor: hex }}
                        className={cn(
                          "flex aspect-square items-center justify-center rounded-full ring-offset-1 ring-offset-popover",
                          selected
                            ? "ring-2 ring-foreground"
                            : "ring-1 ring-foreground/15 hover:ring-foreground/50",
                        )}
                      >
                        {selected && (
                          <Check
                            strokeWidth={3.5}
                            className={cn(
                              "size-3",
                              isLight(hex) ? "text-black/70" : "text-white",
                            )}
                          />
                        )}
                      </button>
                    );
                  })}
                </div>
                <p className="mt-2 text-[0.6875rem] leading-tight text-muted-foreground">
                  Pick your exact brand color.
                </p>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => {
              setPickOpen(false);
              onClear();
            }}
            aria-label="Remove imported brand"
            className="flex size-6 shrink-0 items-center justify-center rounded-full text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="size-3.5" />
          </button>
        </div>
      ) : (
        // ── Empty: URL input + Import, with an upload fallback ──────────────
        <>
          <div className="flex gap-1.5">
            <div className="flex flex-1 items-center gap-1.5 rounded-lg border border-input bg-background px-2.5 focus-within:ring-2 focus-within:ring-ring">
              <Globe className="size-3.5 shrink-0 text-muted-foreground" />
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    importUrl();
                  }
                }}
                placeholder="yourcompany.com"
                inputMode="url"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                disabled={busy}
                aria-label="Your website URL"
                className="w-full bg-transparent py-2 text-sm outline-none placeholder:text-muted-foreground/60"
              />
            </div>
            <button
              type="button"
              onClick={importUrl}
              disabled={busy || !url.trim()}
              className="flex shrink-0 items-center gap-1.5 rounded-lg bg-foreground px-3 text-xs font-semibold text-background outline-none transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading === "url" && <Loader2 className="size-3.5 animate-spin" />}
              Import
            </button>
          </div>
          {/* Long scrapes (up to 15s) read as frozen without a progress line. */}
          {loading === "url" && (
            <p className="mt-1.5 text-xs text-muted-foreground" aria-live="polite">
              Reading {url.trim().replace(/^https?:\/\//, "").split("/")[0]}…
            </p>
          )}
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="mt-1.5 flex items-center gap-1 rounded text-xs text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          >
            {loading === "file" ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <Upload className="size-3" />
            )}
            or upload your logo to match its colors
          </button>
        </>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        aria-label="Upload your logo"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) importFile(f);
          e.target.value = "";
        }}
      />
    </div>
  );
}
