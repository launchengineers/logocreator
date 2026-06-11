"use client";

import { useCallback, useRef, useState } from "react";
import {
  type AssetSpec,
  aiAssetSpecs,
  categoryPreviews,
  deterministicAssetSpecs,
  downloadBlob,
  extractPalette,
  loadImage,
  makeTransparent,
  paletteFiles,
  pickBrandColor,
  readme,
  slugify,
  toDataUrl,
  zipFiles,
} from "@/app/lib/brand-kit";
import { logoToSvgBlob } from "@/app/lib/svg-export";
import { toast } from "@/hooks/use-toast";
import type { Generation } from "@/app/components/Gallery";

export type BrandKitStatus = "pending" | "building" | "done" | "error";
export type BrandKitItem = {
  group: string;
  name: string;
  filename: string;
  status: BrandKitStatus;
  url?: string;
  /** Built + zipped but not shown as a tile (e.g. favicon size variants). */
  hidden?: boolean;
};

export type BrandKitPhase = "configure" | "building" | "done";

// How many AI (FLUX.1-kontext) renders run at once.
const AI_CONCURRENCY = 4;
// Groups that cost real money (everything else is free canvas work).
const AI_GROUPS = new Set(["Mockups", "Logo lockups"]);

export type BrandKitController = {
  gen: Generation | null;
  open: boolean;
  items: BrandKitItem[];
  palette: string[];
  previews: Record<string, string>;
  phase: BrandKitPhase;
  /** prepare() failed (decode/fetch); the configure step shows an error + retry. */
  prepareError: boolean;
  doneCount: number;
  total: number;
  zipping: boolean;
  /** Begin (or re-focus) a brand kit: opens to the configure step. */
  start: (gen: Generation, apiKeyOverride?: string) => void;
  /** Build only the chosen categories (the rest are dropped). */
  build: (selectedGroups: string[]) => void;
  /** Re-run prepare() for the current logo after a prepare failure. */
  retry: () => void;
  show: () => void;
  minimize: () => void;
  discard: () => void;
  downloadAll: () => Promise<void>;
};

/**
 * The brand-kit engine, lifted out of the modal so the build survives closing
 * the modal. Opening a kit prepares the asset list + previews (free, instant)
 * and shows a category selector; only the categories the user confirms are
 * actually built, so the paid AI renders never run without consent.
 */
export function useBrandKit(apiKey: string): BrandKitController {
  const [gen, setGen] = useState<Generation | null>(null);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<BrandKitItem[]>([]);
  const [palette, setPalette] = useState<string[]>([]);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [phase, setPhase] = useState<BrandKitPhase>("configure");
  const [prepareError, setPrepareError] = useState(false);
  const [zipping, setZipping] = useState(false);

  const blobs = useRef<Map<string, Blob>>(new Map());
  const urls = useRef<string[]>([]);
  const tokenRef = useRef(0); // bumping this cancels the running build
  const genRef = useRef<Generation | null>(null);
  const paletteRef = useRef<string[]>([]);
  const specsRef = useRef<AssetSpec[]>([]); // all candidate specs (pre-selection)

  const cleanup = useCallback(() => {
    tokenRef.current++;
    urls.current.forEach((u) => URL.revokeObjectURL(u));
    urls.current = [];
    blobs.current = new Map();
  }, []);

  const discard = useCallback(() => {
    cleanup();
    genRef.current = null;
    paletteRef.current = [];
    specsRef.current = [];
    setGen(null);
    setOpen(false);
    setItems([]);
    setPalette([]);
    setPreviews({});
    setPhase("configure");
    setPrepareError(false);
  }, [cleanup]);

  // Compute the full candidate asset list + palette + previews, WITHOUT building
  // anything. Lands on the "configure" step for the user to choose categories.
  const prepare = useCallback(async (g: Generation, key: string) => {
    const token = tokenRef.current;
    const alive = () => token === tokenRef.current;
    setPrepareError(false);
    try {
      // History-restored logos are blob: object URLs the server can't fetch;
      // resolve once to a data URL for all server-bound AI assets.
      const dataUrl = await toDataUrl(g.image);
      if (!alive()) return;
      const img = await loadImage(dataUrl);
      if (!alive()) return;
      const transparent = makeTransparent(img);
      const pal = extractPalette(img);
      paletteRef.current = pal;
      setPalette(pal);

      const brandColor = pickBrandColor(g.params.primaryColor, pal);
      const det = deterministicAssetSpecs(img, transparent, {
        logoType: g.params.logoType,
        companyName: g.companyName,
        brandColor,
        palette: pal,
      });
      det.push({
        group: "Logo variants",
        // Honest label: this is an on-device auto-trace of the raster, not a
        // hand-drawn vector (good for scaling, not designer-grade paths).
        name: "SVG (auto-traced)",
        filename: "variants/logo.svg",
        build: () => logoToSvgBlob(dataUrl),
      });
      const ai = aiAssetSpecs(key, dataUrl, g.params.logoType);
      const specs = [...det, ...ai];
      specsRef.current = specs;
      if (!alive()) return;
      setItems(
        specs.map((s) => ({
          ...s,
          status: "pending" as BrandKitStatus,
          hidden: s.hidden,
        })),
      );
      setPreviews(
        categoryPreviews(img, transparent, {
          logoType: g.params.logoType,
          companyName: g.companyName,
          brandColor,
        }),
      );
    } catch {
      // toDataUrl / loadImage / decode failure: surface it instead of leaving
      // the configure spinner hanging forever, and let the user retry.
      if (alive()) {
        setPrepareError(true);
        toast({
          variant: "destructive",
          title: "Couldn't prepare this logo's assets",
          description: "Try again, or close and reopen the brand kit.",
        });
      }
    }
  }, []);

  const build = useCallback(async (selectedGroups: string[]) => {
    const token = tokenRef.current;
    const alive = () => token === tokenRef.current;
    const sel = new Set(selectedGroups);
    const specs = specsRef.current.filter((s) => sel.has(s.group));
    if (!specs.length) return;

    // Narrow the kit to the chosen categories, then build.
    setItems(
      specs.map((s) => ({
        ...s,
        status: "pending" as BrandKitStatus,
        hidden: s.hidden,
      })),
    );
    setPhase("building");

    const set = (filename: string, patch: Partial<BrandKitItem>) => {
      if (!alive()) return;
      setItems((prev) =>
        prev.map((it) => (it.filename === filename ? { ...it, ...patch } : it)),
      );
    };
    const store = (spec: AssetSpec, blob: Blob) => {
      blobs.current.set(spec.filename, blob);
      const url = URL.createObjectURL(blob);
      urls.current.push(url);
      set(spec.filename, { status: "done", url });
    };
    const buildOne = async (spec: AssetSpec) => {
      if (!alive()) return;
      set(spec.filename, { status: "building" });
      try {
        const blob = await spec.build();
        if (!alive()) return;
        store(spec, blob);
      } catch {
        if (!alive()) return;
        set(spec.filename, { status: "error" });
      }
    };

    // Deterministic canvas assets first (instant), then AI with concurrency.
    const det = specs.filter((s) => !AI_GROUPS.has(s.group));
    const ai = specs.filter((s) => AI_GROUPS.has(s.group));
    for (const spec of det) {
      if (!alive()) return;
      await buildOne(spec);
    }
    let idx = 0;
    const worker = async () => {
      while (alive()) {
        const i = idx++;
        if (i >= ai.length) return;
        await buildOne(ai[i]);
      }
    };
    await Promise.all(Array.from({ length: AI_CONCURRENCY }, () => worker()));

    if (alive()) setPhase("done");
  }, []);

  const start = useCallback(
    (g: Generation, apiKeyOverride?: string) => {
      // Same logo → just re-open (keep whatever phase it's in).
      if (genRef.current?.id === g.id) {
        setOpen(true);
        return;
      }
      cleanup();
      genRef.current = g;
      paletteRef.current = [];
      specsRef.current = [];
      setGen(g);
      setItems([]);
      setPalette([]);
      setPreviews({});
      setPhase("configure");
      setOpen(true);
      prepare(g, apiKeyOverride ?? apiKey);
    },
    [apiKey, cleanup, prepare],
  );

  const downloadAll = useCallback(async () => {
    const g = genRef.current;
    if (!g || zipping) return;
    // Don't hand back a "brand kit" that is only the palette + README because
    // every asset failed (e.g. a bad key knocked out the AI renders and the
    // canvas work errored).
    if (blobs.current.size === 0) {
      toast({
        variant: "destructive",
        title: "Nothing to download yet",
        description:
          "No assets were built. Check your API key or connection and try again.",
      });
      return;
    }
    setZipping(true);
    try {
      const files: { path: string; data: Blob | string }[] = [];
      blobs.current.forEach((data, path) => files.push({ path, data }));
      const pal = paletteRef.current;
      const { css, json } = paletteFiles(pal);
      files.push({ path: "brand-colors.css", data: css });
      files.push({ path: "brand-colors.json", data: json });
      files.push({ path: "README.txt", data: readme(g.companyName, pal) });
      const blob = await zipFiles(files);
      downloadBlob(blob, `${slugify(g.companyName)}-brand-kit.zip`);
      toast({
        title: "Brand kit downloaded",
        description: `${files.length} files zipped.`,
      });
    } catch {
      toast({ variant: "destructive", title: "Couldn't build the zip" });
    } finally {
      setZipping(false);
    }
  }, [zipping]);

  const retry = useCallback(() => {
    const g = genRef.current;
    if (g) prepare(g, apiKey);
  }, [apiKey, prepare]);

  const show = useCallback(() => setOpen(true), []);
  const minimize = useCallback(() => setOpen(false), []);

  return {
    gen,
    open,
    items,
    palette,
    previews,
    phase,
    prepareError,
    // Hidden items (favicon size variants) still build + zip, but aren't shown
    // or counted, so the progress matches the visible tiles.
    doneCount: items.filter((i) => !i.hidden && i.status === "done").length,
    total: items.filter((i) => !i.hidden).length,
    zipping,
    start,
    build,
    retry,
    show,
    minimize,
    discard,
    downloadAll,
  };
}
