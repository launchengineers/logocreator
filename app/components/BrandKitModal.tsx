"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Download, Loader2, Package, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/app/components/ui/dialog";
import { Button } from "@/app/components/ui/button";
import { toast } from "@/hooks/use-toast";
import {
  type AssetSpec,
  deterministicAssetSpecs,
  downloadBlob,
  extractPalette,
  loadImage,
  makeTransparent,
  paletteFiles,
  readme,
  slugify,
  zipFiles,
} from "@/app/lib/brand-kit";
import type { Generation } from "./Gallery";

type Status = "pending" | "building" | "done" | "error";
type Item = {
  group: string;
  name: string;
  filename: string;
  status: Status;
  url?: string;
};

const GROUP_ORDER = ["Variants", "AI variants", "Favicons & icons", "Social"];

export default function BrandKitModal({
  gen,
  apiKey,
  onClose,
}: {
  gen: Generation | null;
  apiKey: string;
  onClose: () => void;
}) {
  const [items, setItems] = useState<Item[]>([]);
  const [palette, setPalette] = useState<string[]>([]);
  const [phase, setPhase] = useState<"building" | "done">("building");
  const [zipping, setZipping] = useState(false);

  const blobs = useRef<Map<string, Blob>>(new Map());
  const urls = useRef<string[]>([]);
  const builtFor = useRef<string | null>(null);

  const reset = useCallback(() => {
    urls.current.forEach((u) => URL.revokeObjectURL(u));
    urls.current = [];
    blobs.current = new Map();
    setItems([]);
    setPalette([]);
    setPhase("building");
    builtFor.current = null;
  }, []);

  useEffect(() => {
    if (!gen) return;
    if (builtFor.current === gen.id) return;
    builtFor.current = gen.id;

    let cancelled = false;
    const set = (filename: string, patch: Partial<Item>) =>
      setItems((prev) =>
        prev.map((it) => (it.filename === filename ? { ...it, ...patch } : it)),
      );

    (async () => {
      const img = await loadImage(gen.image);
      if (cancelled) return;
      const transparent = makeTransparent(img);
      setPalette(extractPalette(img));

      const det = deterministicAssetSpecs(img, transparent);

      const ai: AssetSpec[] = [
        {
          group: "AI variants",
          name: "Horizontal lockup",
          filename: "ai/horizontal-lockup.png",
          build: () =>
            editLogo(
              apiKey,
              gen.image,
              `Rearrange this exact logo into a clean horizontal lockup: keep the icon on the left and place the company name "${gen.companyName}" to its right in matching typography. Plain solid white background, same colors and style.`,
              1344,
              768,
            ),
        },
        {
          group: "AI variants",
          name: "Icon only",
          filename: "ai/icon-only.png",
          build: () =>
            editLogo(
              apiKey,
              gen.image,
              `Keep only the icon or symbol from this logo as a standalone mark with no text, centered on a plain solid white background. Same colors and style.`,
              1024,
              1024,
            ),
        },
      ];

      const specs = [...det, ...ai];
      if (cancelled) return;
      setItems(specs.map((s) => ({ ...s, status: "pending" as Status })));

      for (const spec of specs) {
        if (cancelled) return;
        set(spec.filename, { status: "building" });
        try {
          const blob = await spec.build();
          if (cancelled) return;
          blobs.current.set(spec.filename, blob);
          const url = URL.createObjectURL(blob);
          urls.current.push(url);
          set(spec.filename, { status: "done", url });
        } catch {
          if (cancelled) return;
          set(spec.filename, { status: "error" });
        }
      }
      if (!cancelled) setPhase("done");
    })();

    return () => {
      cancelled = true;
    };
  }, [gen, apiKey]);

  async function handleDownloadAll() {
    if (!gen || zipping) return;
    setZipping(true);
    try {
      const files: { path: string; data: Blob | string }[] = [];
      blobs.current.forEach((data, path) => files.push({ path, data }));
      const { css, json } = paletteFiles(palette);
      files.push({ path: "brand-colors.css", data: css });
      files.push({ path: "brand-colors.json", data: json });
      files.push({ path: "README.txt", data: readme(gen.companyName, palette) });
      const blob = await zipFiles(files);
      downloadBlob(blob, `${slugify(gen.companyName)}-brand-kit.zip`);
      toast({
        title: "Brand kit downloaded",
        description: `${files.length} files zipped.`,
      });
    } catch {
      toast({ variant: "destructive", title: "Couldn't build the zip" });
    } finally {
      setZipping(false);
    }
  }

  const doneCount = items.filter((i) => i.status === "done").length;
  const total = items.length || 1;
  const groups = GROUP_ORDER.filter((g) => items.some((i) => i.group === g));

  return (
    <Dialog
      open={!!gen}
      onOpenChange={(o) => {
        if (!o) {
          onClose();
          reset();
        }
      }}
    >
      {gen && (
        <DialogContent className="flex max-h-[88vh] max-w-3xl flex-col gap-0 overflow-hidden rounded-2xl p-0">
          <DialogHeader className="space-y-1 border-b border-border px-6 py-5 text-left">
            <DialogTitle className="text-lg">
              {phase === "done" ? "Your brand kit is ready" : "Building your brand kit"}
            </DialogTitle>
            <DialogDescription>
              {gen.companyName || "Your logo"} — variants, favicons, social
              assets and a color palette.
            </DialogDescription>
          </DialogHeader>

          {/* Progress */}
          <div className="border-b border-border px-6 py-3">
            <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
              <span>
                {doneCount} of {total} assets
              </span>
              {phase === "building" && (
                <span className="flex items-center gap-1.5">
                  <Loader2 className="size-3 animate-spin" /> generating…
                </span>
              )}
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full bg-primary transition-all duration-500"
                style={{ width: `${(doneCount / total) * 100}%` }}
              />
            </div>
          </div>

          {/* Body */}
          <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-6 py-5">
            {palette.length > 0 && (
              <div>
                <span className="label-eyebrow mb-2.5 block">Color palette</span>
                <div className="flex flex-wrap gap-2">
                  {palette.map((hex) => (
                    <span
                      key={hex}
                      title={hex}
                      className="flex items-center gap-1.5 rounded-full border border-border py-1 pl-1 pr-2.5"
                    >
                      <span
                        className="size-5 rounded-full ring-1 ring-foreground/10"
                        style={{ backgroundColor: hex }}
                      />
                      <span className="text-xs font-medium uppercase text-muted-foreground">
                        {hex}
                      </span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {groups.map((group) => (
              <div key={group}>
                <span className="label-eyebrow mb-2.5 block">{group}</span>
                <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                  {items
                    .filter((i) => i.group === group)
                    .map((item) => (
                      <AssetTile key={item.filename} item={item} />
                    ))}
                </div>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between gap-3 border-t border-border px-6 py-4">
            <span className="text-xs text-muted-foreground">
              {phase === "done"
                ? "All set — download the full kit."
                : "Assets appear as they finish."}
            </span>
            <Button
              onClick={handleDownloadAll}
              disabled={doneCount === 0 || zipping}
              className="rounded-lg font-bold"
            >
              {zipping ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Package className="size-4" />
              )}
              Download all (.zip)
            </Button>
          </div>
        </DialogContent>
      )}
    </Dialog>
  );
}

function AssetTile({ item }: { item: Item }) {
  return (
    <div className="group/tile relative aspect-square overflow-hidden rounded-lg border border-border bg-secondary/50">
      {item.url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.url}
          alt={item.name}
          className="h-full w-full object-contain p-2"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          {item.status === "building" ? (
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          ) : item.status === "error" ? (
            <X className="size-4 text-muted-foreground/50" />
          ) : (
            <span className="size-1.5 rounded-full bg-muted-foreground/40" />
          )}
        </div>
      )}

      {item.status === "done" && (
        <span className="absolute right-1.5 top-1.5 flex size-4 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Check className="size-2.5" strokeWidth={3} />
        </span>
      )}

      {item.url && (
        <a
          href={item.url}
          download={item.filename.split("/").pop()}
          aria-label={`Download ${item.name}`}
          className="absolute inset-0 flex items-end justify-center bg-gradient-to-t from-black/40 to-transparent opacity-0 transition-opacity group-hover/tile:opacity-100"
        >
          <span className="mb-1.5 flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[0.65rem] font-medium text-white backdrop-blur">
            <Download className="size-2.5" />
            {item.name}
          </span>
        </a>
      )}
    </div>
  );
}

async function editLogo(
  apiKey: string,
  image: string,
  prompt: string,
  width: number,
  height: number,
): Promise<Blob> {
  const res = await fetch("/api/edit-logo", {
    method: "POST",
    body: JSON.stringify({ userAPIKey: apiKey, image, prompt, width, height }),
  });
  if (!res.ok) throw new Error("edit failed");
  const json = await res.json();
  const resp = await fetch(`data:image/png;base64,${json.b64_json}`);
  return resp.blob();
}
