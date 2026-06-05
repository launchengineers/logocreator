"use client";

import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";
import { Download, RefreshCw } from "lucide-react";
import { slugify } from "@/app/lib/brand-kit";
import { LogoMark } from "./Logo";

export type GenParams = {
  companyName: string;
  selectedStyle: string;
  logoType: string;
  primaryColor: string;
  backgroundColor: string;
  detailLevel: string;
  monochrome: boolean;
  additionalInfo: string;
};

export type Generation = {
  id: string;
  image: string;
  companyName: string;
  params: GenParams;
};

const EASE = [0.22, 1, 0.36, 1] as const;

function SkeletonCell() {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.3, ease: EASE }}
      className="shimmer relative flex aspect-square flex-col items-center justify-center gap-3 overflow-hidden rounded-2xl border border-border bg-card"
    >
      <span className="spinner-ring size-7" />
      <span className="text-xs font-medium text-muted-foreground">
        Generating…
      </span>
    </motion.div>
  );
}

function GenerationCell({
  gen,
  index,
  onRegenerate,
  onOpen,
}: {
  gen: Generation;
  index: number;
  onRegenerate: (gen: Generation) => void;
  onOpen: (gen: Generation) => void;
}) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.94, y: 12 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.94 }}
      transition={{ duration: 0.38, ease: EASE, delay: Math.min(index, 6) * 0.035 }}
      onClick={() => onOpen(gen)}
      className="group relative aspect-square cursor-pointer overflow-hidden rounded-2xl border border-border bg-card"
    >
      <Image
        src={gen.image}
        alt={gen.companyName ? `${gen.companyName} logo` : "Generated logo"}
        width={512}
        height={512}
        unoptimized
        priority={index < 3}
        className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.04]"
      />
      <div className="pointer-events-none absolute inset-0 flex items-end justify-center bg-gradient-to-t from-black/45 via-black/0 to-transparent opacity-0 transition-opacity duration-200 group-hover:opacity-100">
        <div className="pointer-events-auto mb-3 flex items-center gap-0.5 rounded-full border border-white/15 bg-black/55 p-1 backdrop-blur-md">
          <a
            href={gen.image}
            download={`${slugify(gen.companyName)}.png`}
            onClick={(e) => e.stopPropagation()}
            aria-label="Download PNG"
            title="Download PNG"
            className="flex size-8 items-center justify-center rounded-full text-white/90 transition-colors hover:bg-white/15"
          >
            <Download className="size-4" />
          </a>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRegenerate(gen);
            }}
            aria-label="Regenerate this logo"
            title="Regenerate"
            className="flex size-8 items-center justify-center rounded-full text-white/90 transition-colors hover:bg-white/15"
          >
            <RefreshCw className="size-4" />
          </button>
        </div>
      </div>
    </motion.div>
  );
}

export default function Gallery({
  generations,
  isLoading,
  onRegenerate,
  onOpen,
}: {
  generations: Generation[];
  isLoading: boolean;
  onRegenerate: (gen: Generation) => void;
  onOpen: (gen: Generation) => void;
}) {
  if (generations.length === 0 && !isLoading) {
    return (
      <div className="flex h-full min-h-[16rem] flex-col items-center justify-center px-8 py-16 text-center">
        <LogoMark className="size-12 animate-pulse-soft opacity-25" />
        <h2 className="mt-5 text-lg font-bold text-foreground">
          Your logos will appear here
        </h2>
        <p className="mt-1.5 max-w-xs text-pretty text-sm text-muted-foreground">
          Fill in the details, hit Generate, and every logo you make stacks up
          right here.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3.5 p-5 sm:gap-4 sm:p-6 lg:grid-cols-3">
      <AnimatePresence initial={false}>
        {isLoading && <SkeletonCell key="skeleton" />}
        {generations.map((gen, i) => (
          <GenerationCell
            key={gen.id}
            gen={gen}
            index={i}
            onRegenerate={onRegenerate}
            onOpen={onOpen}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}
