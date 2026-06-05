"use client";

import Image from "next/image";
import { Download, RefreshCw, Sparkles } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/app/components/ui/dialog";
import { Button } from "@/app/components/ui/button";
import { slugify } from "@/app/lib/brand-kit";
import { LOGO_TYPES } from "./LogoTypeSelect";
import type { Generation } from "./Gallery";

function typeLabel(key: string) {
  return LOGO_TYPES.find((t) => t.key === key)?.label ?? key;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="label-eyebrow">{label}</span>
      <span className="text-sm font-medium text-foreground">{value}</span>
    </div>
  );
}

function ColorRow({ label, hex }: { label: string; hex: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="label-eyebrow">{label}</span>
      <span className="flex items-center gap-2">
        <span
          className="size-4 rounded-full ring-1 ring-foreground/15"
          style={{ backgroundColor: hex }}
        />
        <span className="text-sm font-medium uppercase text-foreground">
          {hex}
        </span>
      </span>
    </div>
  );
}

export default function GenerationModal({
  gen,
  onClose,
  onRegenerate,
  onCreateBrandKit,
}: {
  gen: Generation | null;
  onClose: () => void;
  onRegenerate: (gen: Generation) => void;
  onCreateBrandKit: (gen: Generation) => void;
}) {
  return (
    <Dialog open={!!gen} onOpenChange={(o) => !o && onClose()}>
      {gen && (
        <DialogContent className="max-w-4xl gap-0 overflow-hidden rounded-2xl p-0">
          <DialogTitle className="sr-only">
            {gen.companyName || "Generated logo"}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Large preview and actions for this generated logo.
          </DialogDescription>
          <div className="grid md:grid-cols-[1fr_17rem]">
            {/* Preview */}
            <div className="flex items-center justify-center bg-background p-6 sm:p-10">
              <div className="relative aspect-square w-full max-w-md overflow-hidden rounded-xl border border-border">
                <Image
                  src={gen.image}
                  alt={gen.companyName ? `${gen.companyName} logo` : "Logo"}
                  width={768}
                  height={768}
                  unoptimized
                  priority
                  className="h-full w-full object-cover"
                />
              </div>
            </div>

            {/* Sidebar */}
            <div className="flex flex-col border-t border-border bg-card p-5 md:border-l md:border-t-0">
              <h2 className="truncate text-lg font-bold text-foreground">
                {gen.companyName || "Untitled"}
              </h2>
              <p className="label-eyebrow mt-1">
                {typeLabel(gen.params.logoType)}
              </p>

              <div className="mt-5 space-y-3 border-t border-border pt-5">
                <Row label="Style" value={gen.params.selectedStyle} />
                <Row label="Detail" value={gen.params.detailLevel} />
                {gen.params.monochrome && <Row label="Mode" value="Monochrome" />}
                <ColorRow label="Primary" hex={gen.params.primaryColor} />
                <ColorRow label="Background" hex={gen.params.backgroundColor} />
              </div>

              <div className="mt-auto space-y-2 pt-6">
                <Button
                  onClick={() => onCreateBrandKit(gen)}
                  className="w-full rounded-lg font-bold"
                >
                  <Sparkles className="size-4" />
                  Create brand kit
                </Button>
                <div className="flex gap-2">
                  <Button asChild variant="secondary" className="flex-1 rounded-lg">
                    <a
                      href={gen.image}
                      download={`${slugify(gen.companyName)}.png`}
                    >
                      <Download className="size-4" />
                      PNG
                    </a>
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => onRegenerate(gen)}
                    className="flex-1 rounded-lg"
                  >
                    <RefreshCw className="size-4" />
                    Redo
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
      )}
    </Dialog>
  );
}
