"use client";

import { useEffect, useRef, useState } from "react";
import { MotionConfig } from "framer-motion";
import {
  AlertTriangle,
  ChevronRight,
  Dices,
  Github,
  HelpCircle,
  History,
  Sparkles,
  X,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Textarea } from "@/app/components/ui/textarea";
import Logo from "./components/Logo";
import ThemeToggle from "./components/ThemeToggle";
import ApiKeyDialog from "./components/ApiKeyDialog";
import StylePicker, { SURPRISE_STYLE } from "./components/StylePicker";
import ColorSwatches, { AUTO_COLOR } from "./components/ColorSwatches";
import Segmented from "./components/Segmented";
import LogoTypeSelect, { LOGO_TYPES } from "./components/LogoTypeSelect";
import TogetherCredit from "./components/TogetherCredit";
import GenerationModal from "./components/GenerationModal";
import BrandKitModal from "./components/BrandKitModal";
import BrandKitDock from "./components/BrandKitDock";
import { useBrandKit } from "./hooks/use-brand-kit";
import Gallery, { type GenParams, type Generation } from "./components/Gallery";
import ReferenceUpload, {
  type ReferenceState,
  type ReferenceStatus,
} from "./components/ReferenceUpload";
import HistoryDashboard from "./components/HistoryDashboard";
import WelcomeModal from "./components/WelcomeModal";
import BrandImport, { type BrandImportResult } from "./components/BrandImport";
import { Tip } from "./components/ui/tooltip";
import { formatUsd, pricePerLogo } from "./lib/pricing";
import {
  STARTER_PRESETS,
  DESCRIBE_SUGGESTIONS,
  type StarterPreset,
} from "./lib/presets";
import {
  loadImage,
  toDataUrl,
  extractBrandPalette,
  brandColorFromImport,
} from "./lib/brand-kit";
import {
  saveLogo,
  getAllLogos,
  deleteLogo,
  clearLogos,
  patchLogo,
} from "./lib/history-db";

const FREE_CREDITS = 3;

// Image edits run through Together's FLUX.1-kontext model, which is occasionally
// flaky (intermittent 500/429 or a slow response). Retry transient failures a
// couple of times with a short backoff and a per-attempt timeout, so a single
// hiccup never surfaces to the user as a hard error. Non-retryable client errors
// (e.g. an invalid key) throw immediately with the server's message.
async function editWithRetry(
  payload: {
    userAPIKey: string;
    image: string;
    prompt: string;
    width: number;
    height: number;
  },
  attempts = 3,
): Promise<{ b64_json: string }> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 100_000);
    let res: Response | null = null;
    try {
      res = await fetch("/api/edit-logo", {
        method: "POST",
        body: JSON.stringify(payload),
        signal: ctrl.signal,
      });
    } catch (e) {
      lastErr = e; // network error or timeout (abort) → retry
    } finally {
      clearTimeout(timer);
    }
    if (res) {
      if (res.ok) return await res.json();
      // A non-retryable client error (e.g. invalid key) won't fix itself;
      // surface the server's message right away.
      if (res.status < 500 && res.status !== 429) {
        const text = res.headers.get("Content-Type")?.includes("text/plain")
          ? await res.text()
          : "";
        throw new Error(text || "edit failed");
      }
      lastErr = new Error(`status ${res.status}`);
    }
    if (i < attempts - 1) {
      await new Promise((r) => setTimeout(r, 700 * (i + 1)));
    }
  }
  throw lastErr ?? new Error("edit failed");
}

// Write to localStorage without ever throwing (private mode / quota). Returns
// whether it stuck, so callers can warn the user if a save was lost.
function safeSetLocal(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

// Stable id with a fallback for non-secure contexts (crypto.randomUUID needs
// https/localhost: a plain-http LAN/preview deploy would otherwise throw).
function newId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

// Did an IndexedDB write fail because the device is out of storage?
function isQuotaError(e: unknown): boolean {
  return (
    e instanceof DOMException &&
    (e.name === "QuotaExceededError" ||
      e.name === "NS_ERROR_DOM_QUOTA_REACHED")
  );
}

// Map a non-text generation error status to an actionable message.
function genErrorMessage(status: number): string {
  if (status === 401)
    return "Your API key looks invalid. Check it and try again.";
  if (status === 429)
    return "Rate limit reached. Add your own Together key for unlimited generations.";
  if (status === 403)
    return "Your Together account can't access this model yet.";
  if (status >= 500)
    return "Together's image service is busy right now. Give it another try.";
  return "Something went wrong. Please try again.";
}

// Each style cycles through several different marks on hover; frame 0 (resting)
// is our own LogoCreator mark rendered in that style. Generated by
// scripts/gen-style-variants.mjs. (The old fox default still lives at
// `/styles/${key}.png` if we ever want to revert frame 0.)
const styleFrames = (key: string) => [
  `/styles/${key}-logo.png`,
  `/styles/${key}-1.png`,
  `/styles/${key}-2.png`,
  `/styles/${key}-3.png`,
  `/styles/${key}-4.png`,
];

const logoStyles = [
  { name: "Minimal", frames: styleFrames("minimal") },
  { name: "Geometric", frames: styleFrames("geometric") },
  { name: "Gradient", frames: styleFrames("gradient") },
  { name: "Mascot", frames: styleFrames("mascot") },
  { name: "Hand-drawn", frames: styleFrames("hand-drawn") },
  { name: "Luxury", frames: styleFrames("luxury") },
  { name: "Retro", frames: styleFrames("retro") },
  { name: "3D", frames: styleFrames("3d") },
];

function randomStyleName(): string {
  return logoStyles[Math.floor(Math.random() * logoStyles.length)].name;
}

const primaryColors = [
  { name: "Blue", color: "#2F6FF5" },
  { name: "Red", color: "#E5484D" },
  { name: "Green", color: "#30A46C" },
  { name: "Yellow", color: "#F2C40F" },
];

const backgroundColors = [
  { name: "White", color: "#FFFFFF" },
  { name: "Gray", color: "#C9C8C2" },
  { name: "Black", color: "#14130F" },
];

const detailLevels = ["Minimal", "Balanced", "Detailed"] as const;

// WCAG relative luminance + contrast ratio, to warn on hard-to-see color pairs.
function luminance(hex: string): number {
  const h = hex.replace("#", "");
  if (h.length < 6) return 1;
  const channel = (i: number) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
}

function contrastRatio(a: string, b: string): number {
  const l1 = luminance(a);
  const l2 = luminance(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

function XLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24h-6.66l-5.214-6.817-5.966 6.817H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231 5.45-6.231Zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77Z" />
    </svg>
  );
}

const socialLink =
  "flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground";

export default function Page() {
  // Inputs
  const [companyName, setCompanyName] = useState("");
  const [logoType, setLogoType] = useState(LOGO_TYPES[0].key as string);
  const [selectedStyle, setSelectedStyle] = useState(logoStyles[0].name);
  // Default both colors to "auto": the AI picks a fitting palette unless the
  // user overrides it (or a preset / brand import sets one).
  const [primaryColor, setPrimaryColor] = useState<string>(AUTO_COLOR);
  const [backgroundColor, setBackgroundColor] = useState<string>(AUTO_COLOR);
  const [detailLevel, setDetailLevel] = useState<string>("Balanced");
  const [monochrome, setMonochrome] = useState(false);
  const [additionalInfo, setAdditionalInfo] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [activePreset, setActivePreset] = useState<string | null>(null);

  // Reference logo (read by a vision model → auto-applies style + color)
  const [reference, setReference] = useState<ReferenceState | null>(null);
  const [refStatus, setRefStatus] = useState<ReferenceStatus>("idle");

  // Brand imported from a website/logo → pre-fills name + brand color.
  const [imported, setImported] = useState<{
    source: string;
    color: string;
    name?: string | null;
    logo?: string | null;
    palette?: string[]; // detected brand colors the user can re-pick from
  } | null>(null);

  // Account-less state
  const [userAPIKey, setUserAPIKey] = useState("");
  const [credits, setCredits] = useState(FREE_CREDITS);
  const [apiKeyOpen, setApiKeyOpen] = useState(false);

  // Generation state. A "run" fires N parallel requests (a set of variations);
  // pendingCount is how many are still in flight (drives the skeletons).
  const [pendingCount, setPendingCount] = useState(0);
  const [variationCount, setVariationCount] = useState(4);
  const isGenerating = pendingCount > 0;
  // Screen-reader announcements for async results (aria-live region).
  const [liveMessage, setLiveMessage] = useState("");
  // "Keep editing" runs independently of the main generate flow, so it gets its
  // own flag (otherwise an edit would spawn a phantom skeleton in the gallery).
  const [isEditing, setIsEditing] = useState(false);
  const [generations, setGenerations] = useState<Generation[]>([]);

  // Modals
  const [activeGen, setActiveGen] = useState<Generation | null>(null);
  const [pendingBrandKitGen, setPendingBrandKitGen] =
    useState<Generation | null>(null);

  // Brand kit lives in a hook so it survives the modal closing (minimize → dock).
  const brandKit = useBrandKit(userAPIKey);

  // On-device logo history (IndexedDB).
  const [historyOpen, setHistoryOpen] = useState(false);
  const historyLoadedRef = useRef(false);
  const quotaWarnedRef = useRef(false); // warn once if on-device storage fills
  const refReqRef = useRef(0); // cancels a stale reference-read response
  const importReqRef = useRef(0); // cancels a stale brand-import response
  // Synchronous single-flight guards. A React state flag (isGenerating/isEditing)
  // updates too late to stop a fast double-click, which would double-charge a
  // free credit and spawn phantom skeletons; a ref flips immediately.
  const runningRef = useRef(false);
  const editingRef = useRef(false);
  // Charge a run's free credit once, on its first successful logo (so closing
  // the tab mid-batch never burns a credit for nothing).
  const chargedRef = useRef(false);
  // Warn once if a non-quota persistence write fails (so it isn't silent).
  const persistWarnedRef = useRef(false);
  // Per-logo save promises, so a fast favorite/rename can wait for the record
  // to exist before patching it.
  const savePromises = useRef<Map<string, Promise<unknown>>>(new Map());

  // First-visit welcome modal.
  const [welcomeOpen, setWelcomeOpen] = useState(false);

  // Load persisted key + credits after mount (avoids hydration mismatches).
  useEffect(() => {
    setUserAPIKey(localStorage.getItem("userAPIKey") || "");
    const stored = localStorage.getItem("lc_credits");
    if (stored !== null) setCredits(Math.max(0, parseInt(stored, 10) || 0));

    // Show the welcome modal on the first visit only.
    try {
      if (!localStorage.getItem("lc_welcomed")) setWelcomeOpen(true);
    } catch {
      /* localStorage blocked, skip onboarding */
    }

    // Restore saved logos from IndexedDB into the gallery (once; the ref guard
    // survives React StrictMode's double-invoke so we don't duplicate them).
    if (!historyLoadedRef.current) {
      historyLoadedRef.current = true;
      getAllLogos()
        .then((recs) => {
          if (!recs.length) return;
          // Only hydrate the most recent window into the live gallery (each one
          // costs a multi-MB blob object URL + a mounted cell); the full set
          // stays in IndexedDB and is browsable in the History dashboard.
          const restored: Generation[] = recs.slice(0, 60).map((r) => ({
            id: r.id,
            image: URL.createObjectURL(r.blob),
            companyName: r.companyName,
            params: r.params,
            createdAt: r.createdAt,
            favorite: r.favorite,
            name: r.name,
          }));
          // Merge by id (a logo generated before restore finished may already
          // be in state via its own save) and re-sort newest-first, so the
          // order is stable and React keys never collide.
          setGenerations((prev) => {
            const seen = new Set(prev.map((g) => g.id));
            const add = restored.filter((r) => !seen.has(r.id));
            return [...prev, ...add].sort(
              (a, b) => (b.createdAt || 0) - (a.createdAt || 0),
            );
          });
        })
        .catch(() => {});
    }
  }, []);

  const hasOwnKey = userAPIKey.trim().length > 0;

  // Adjust credits by a delta using a functional update, so overlapping flows
  // (e.g. an edit fired while a batch is still generating) can never clobber
  // each other's charge/refund by reading a stale `credits` from a closure.
  function adjustCredits(delta: number) {
    setCredits((c) => {
      const n = Math.max(0, c + delta);
      safeSetLocal("lc_credits", String(n));
      return n;
    });
  }

  // Persisting a logo to IndexedDB failed. If the device is out of storage, tell
  // the user once (so a logo silently vanishing on reload isn't a mystery).
  function onPersistError(e: unknown) {
    if (isQuotaError(e)) {
      if (quotaWarnedRef.current) return;
      quotaWarnedRef.current = true;
      toast({
        variant: "destructive",
        title: "On-device storage is full",
        description:
          "New logos won't be saved across reloads. Download anything you want to keep, or clear your history.",
      });
      return;
    }
    // Any other persistence failure (private mode, blocked IndexedDB, a missing
    // record): warn once so a logo / favorite / rename silently vanishing on
    // reload isn't a mystery.
    if (persistWarnedRef.current) return;
    persistWarnedRef.current = true;
    toast({
      variant: "destructive",
      title: "Couldn't save to this device",
      description:
        "Your logos may not survive a reload here. Download anything you want to keep.",
    });
  }

  function handleApiKeySave(key: string) {
    setUserAPIKey(key);
    if (!safeSetLocal("userAPIKey", key)) {
      toast({
        variant: "destructive",
        title: "Couldn't save your key",
        description:
          "Browser storage is blocked (private mode?). It'll work this session but won't persist.",
      });
    }
    // If they were trying to make a brand kit, continue into it now.
    if (key.trim() && pendingBrandKitGen) {
      brandKit.start(pendingBrandKitGen, key);
      setPendingBrandKitGen(null);
    }
  }

  // Brand kit always requires the user's own key.
  function handleCreateBrandKit(gen: Generation) {
    setActiveGen(null);
    if (userAPIKey.trim()) {
      brandKit.start(gen);
    } else {
      setPendingBrandKitGen(gen);
      setApiKeyOpen(true);
    }
  }

  // One logo. On success it pops into the gallery (and on-device history) the
  // moment it lands; returns a result the batch uses for credit/error handling.
  async function generateOne(
    params: GenParams,
  ): Promise<{ ok: boolean; error?: string }> {
    try {
      const res = await fetch("/api/generate-logo", {
        method: "POST",
        body: JSON.stringify({ userAPIKey, ...params }),
      });
      if (res.ok) {
        const json = await res.json();
        const id = newId();
        const image = `data:image/png;base64,${json.b64_json}`;
        const createdAt = Date.now();
        setGenerations((prev) => [
          { id, image, companyName: params.companyName, params, createdAt },
          ...prev,
        ]);
        // Charge the run's single free credit the moment its FIRST logo lands,
        // not up front: closing the tab mid-batch then costs nothing.
        if (!hasOwnKey && !chargedRef.current) {
          chargedRef.current = true;
          adjustCredits(-1);
        }
        const savePromise = fetch(image)
          .then((r) => r.blob())
          .then((blob) =>
            saveLogo({ id, companyName: params.companyName, params, createdAt, blob }),
          )
          .catch(onPersistError);
        savePromises.current.set(id, savePromise);
        return { ok: true };
      }
      const text = res.headers.get("Content-Type")?.includes("text/plain")
        ? await res.text()
        : genErrorMessage(res.status);
      return { ok: false, error: text };
    } catch {
      return { ok: false, error: "Network error. Check your connection and try again." };
    }
  }

  // A "run": fire N parallel generations (a set of variations). Costs 1 free
  // credit per run regardless of N; refunded if the entire run fails.
  async function runBatch(params: GenParams, n: number) {
    if (runningRef.current) return;
    if (!hasOwnKey && credits <= 0) {
      setApiKeyOpen(true);
      return;
    }
    runningRef.current = true;
    chargedRef.current = false;
    try {
      setPendingCount(n);
      setLiveMessage(n > 1 ? `Generating ${n} logos…` : "Generating a logo…");

      const results = await Promise.all(
        Array.from({ length: n }, () =>
          generateOne(params).finally(() =>
            setPendingCount((c) => Math.max(0, c - 1)),
          ),
        ),
      );
      // Safety net: the run is over, so no skeleton can be left stuck.
      setPendingCount(0);

      const oks = results.filter((r) => r.ok).length;
      setLiveMessage(
        oks === 0
          ? "Generation failed."
          : `${oks} ${oks === 1 ? "logo" : "logos"} ready.`,
      );
      if (oks === 0) {
        // Nothing was charged (we only charge on a successful logo), so no
        // refund needed.
        toast({
          variant: "destructive",
          title: "Couldn't generate",
          description:
            results.find((r) => r.error)?.error ?? "Please try again.",
        });
      } else if (oks < n) {
        toast({
          title: `Generated ${oks} of ${n}`,
          description: "Some variations didn't come through. Vary for more.",
        });
      }
    } finally {
      runningRef.current = false;
    }
  }

  // Backwards-compatible single-logo helper (used by Redo).
  function runGeneration(params: GenParams) {
    return runBatch(params, 1);
  }

  // "Keep editing": image-to-image edit of an existing logo via kontext. The
  // result becomes a new logo (added to the gallery + history); the lightbox
  // updates in place so you can keep iterating.
  // Returns whether the edit succeeded, so the composer can keep the user's
  // typed instruction on failure (nothing more frustrating than losing it).
  async function runEdit(gen: Generation, instruction: string): Promise<boolean> {
    const text = instruction.trim();
    if (editingRef.current || !text) return false;
    if (!hasOwnKey && credits <= 0) {
      setApiKeyOpen(true);
      return false;
    }
    editingRef.current = true;
    setIsEditing(true);
    try {
      // History-restored logos are blob: object URLs the server can't fetch;
      // resolve to a data URL first (fresh data URLs pass through untouched).
      const sourceImage = await toDataUrl(gen.image);
      const json = await editWithRetry({
        userAPIKey,
        image: sourceImage,
        prompt: text,
        width: 1024,
        height: 1024,
      });
      const id = newId();
      const image = `data:image/png;base64,${json.b64_json}`;
      const createdAt = Date.now();
      const params: GenParams = { ...gen.params, additionalInfo: text };
      const next: Generation = {
        id,
        image,
        companyName: gen.companyName,
        params,
        createdAt,
      };
      setGenerations((prev) => [next, ...prev]);
      const savePromise = fetch(image)
        .then((r) => r.blob())
        .then((blob) =>
          saveLogo({ id, companyName: gen.companyName, params, createdAt, blob }),
        )
        .catch(onPersistError);
      savePromises.current.set(id, savePromise);
      if (!hasOwnKey) adjustCredits(-1);
      setActiveGen(next); // keep the lightbox on the new result to iterate
      return true;
    } catch (err) {
      // A meaningful message means a non-retryable problem (e.g. invalid key);
      // anything else is a transient hiccup after retries were exhausted.
      const msg = err instanceof Error ? err.message : "";
      const meaningful = msg && !/^(status \d+|edit failed)$/.test(msg);
      toast({
        variant: "destructive",
        title: "Couldn't apply that edit",
        description: meaningful
          ? msg
          : "Together's image service is busy right now. Your text is still here. Give it another try. (No credit was used.)",
      });
      return false;
    } finally {
      setIsEditing(false);
      editingRef.current = false;
    }
  }

  function currentParams(): GenParams {
    return {
      companyName,
      // "Surprise me" resolves to a concrete random style per generation, so
      // each run is a real, varied style (and the lightbox shows which).
      selectedStyle:
        selectedStyle === SURPRISE_STYLE ? randomStyleName() : selectedStyle,
      logoType,
      primaryColor,
      backgroundColor,
      detailLevel,
      monochrome,
      additionalInfo,
      referenceDescription: reference?.description || undefined,
    };
  }

  // "I'm feeling lucky": random style + AI-chosen color, generate immediately.
  function handleLucky() {
    if (runningRef.current) return;
    setSelectedStyle(SURPRISE_STYLE);
    setPrimaryColor("auto");
    setActivePreset(null);
    runBatch(
      {
        companyName,
        logoType,
        selectedStyle: randomStyleName(),
        primaryColor: "auto",
        backgroundColor,
        detailLevel,
        monochrome,
        additionalInfo,
        referenceDescription: reference?.description || undefined,
      },
      variationCount,
    );
  }

  // Seed the whole form from a one-tap starter preset.
  function applyPreset(p: StarterPreset) {
    setLogoType(p.logoType);
    setSelectedStyle(p.style);
    setPrimaryColor(p.primaryColor);
    setBackgroundColor(p.backgroundColor);
    setDetailLevel(p.detailLevel);
    setAdditionalInfo(p.describe);
    setActivePreset(p.id);
  }

  // Pre-fill the form from an imported website / logo: set the brand color
  // (vivid theme-color, else read from their logo) and the company name, so the
  // next generation lands in their colors. No vision, no credits.
  async function handleBrandImport(r: BrandImportResult) {
    const myReq = ++importReqRef.current;
    let vivid: string[] = [];
    if (r.logoDataUrl) {
      try {
        const img = await loadImage(r.logoDataUrl);
        vivid = extractBrandPalette(img);
      } catch {
        /* couldn't decode their logo, fall back to theme-color / default */
      }
    }
    // A newer import (or another one) superseded this one, don't clobber.
    if (myReq !== importReqRef.current) return;
    const color = brandColorFromImport(r.themeColor ?? null, vivid);
    // The colors offered in the pill's picker: the chosen color first, then the
    // rest of the detected vivid colors (+ a valid theme-color), de-duplicated.
    const themeHex =
      r.themeColor && /^#[0-9a-f]{6}$/i.test(r.themeColor)
        ? r.themeColor.toUpperCase()
        : null;
    const palette = Array.from(
      new Set([color, ...vivid, themeHex].filter(Boolean) as string[]),
    ).slice(0, 6);
    const name = r.name?.trim();
    if (name) setCompanyName(name);
    setPrimaryColor(color);
    setMonochrome(false);
    setActivePreset(null);
    setImported({ source: r.source, color, name, logo: r.logoDataUrl, palette });
    toast({
      title: "Brand imported",
      description: name
        ? `${name} · matched their brand color`
        : "Matched your logo's colors",
    });
  }

  // Re-pick the brand color from the detected palette (in the import pill).
  function pickImportedColor(hex: string) {
    setPrimaryColor(hex);
    setImported((cur) => (cur ? { ...cur, color: hex } : cur));
  }

  // Update a logo in the gallery + lightbox in place (and persist metadata).
  function updateGen(id: string, patch: Partial<Generation>) {
    setGenerations((prev) => prev.map((g) => (g.id === id ? { ...g, ...patch } : g)));
    setActiveGen((cur) => (cur && cur.id === id ? { ...cur, ...patch } : cur));
  }

  async function toggleFavorite(gen: Generation) {
    const favorite = !gen.favorite;
    updateGen(gen.id, { favorite });
    // Wait for the logo's own save to land first (a just-generated logo's record
    // may not exist yet), then persist the change and surface any failure.
    await savePromises.current.get(gen.id);
    patchLogo(gen.id, { favorite }).catch(onPersistError);
  }

  async function renameLogo(gen: Generation, name: string) {
    const trimmed = name.trim();
    updateGen(gen.id, { name: trimmed || undefined });
    await savePromises.current.get(gen.id);
    patchLogo(gen.id, { name: trimmed }).catch(onPersistError);
  }

  async function handleReferenceFile(file: File) {
    const okTypes = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];
    if (!okTypes.includes(file.type)) {
      toast({
        variant: "destructive",
        title: "Unsupported file",
        description: "Use PNG, JPG, WebP or SVG.",
      });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({
        variant: "destructive",
        title: "File too large",
        description: "Keep the reference under 5 MB.",
      });
      return;
    }

    // Token so a newer pick (or a Clear) cancels this read's late writes
    // (otherwise a slow vision response could clobber a newer/removed reference).
    const myReq = ++refReqRef.current;
    const stale = () => myReq !== refReqRef.current;

    const rawDataUrl = await new Promise<string>((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result));
      fr.onerror = () => reject(new Error("read failed"));
      fr.readAsDataURL(file);
    }).catch(() => "");
    if (!rawDataUrl) {
      toast({ variant: "destructive", title: "Couldn't read that file" });
      return;
    }

    // Rasterize SVG (on white) and downscale large rasters to ≤1024px long edge.
    let dataUrl = rawDataUrl;
    try {
      const img = await loadImage(rawDataUrl);
      const w = img.naturalWidth || img.width || 1024;
      const h = img.naturalHeight || img.height || 1024;
      const isSvg = file.type === "image/svg+xml";
      const maxEdge = Math.max(w, h);
      if (isSvg || maxEdge > 1024) {
        const scale = Math.min(1024 / maxEdge, 1);
        const tw = Math.max(1, Math.round(w * scale));
        const th = Math.max(1, Math.round(h * scale));
        const canvas = document.createElement("canvas");
        canvas.width = tw;
        canvas.height = th;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          if (isSvg) {
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(0, 0, tw, th);
          }
          ctx.drawImage(img, 0, 0, tw, th);
          dataUrl = canvas.toDataURL("image/png");
        }
      }
    } catch {
      /* keep rawDataUrl */
    }

    if (stale()) return;
    setReference({
      dataUrl,
      description: "",
      styleGuess: null,
      dominantColor: "auto",
    });
    setRefStatus("reading");

    // Reading needs serverless chat access on the Together account; it can also
    // be slow. Time it out so the spinner never hangs, and always leave the form
    // usable (the typed description is the fallback).
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 25_000);
    try {
      const res = await fetch("/api/read-reference", {
        method: "POST",
        body: JSON.stringify({ userAPIKey, image: dataUrl }),
        signal: ctrl.signal,
      });
      if (!res.ok) {
        const msg = (res.headers.get("Content-Type") || "").includes("text/plain")
          ? await res.text()
          : "Couldn't read that image.";
        if (stale()) return;
        toast({
          variant: "destructive",
          title: "Couldn't read the reference",
          description: `${msg} You can describe it in the box above instead.`,
        });
        setRefStatus("error");
        return;
      }
      const json = await res.json();
      if (stale()) return;
      setReference({
        dataUrl,
        description: json.description || "",
        styleGuess: json.styleGuess ?? null,
        dominantColor: json.dominantColor || "auto",
        keywords: json.keywords,
      });
      setRefStatus("ready");

      // Auto-apply the detected style + color.
      if (json.styleGuess && logoStyles.some((s) => s.name === json.styleGuess)) {
        setSelectedStyle(json.styleGuess);
      }
      if (json.dominantColor && json.dominantColor !== "auto") {
        setPrimaryColor(json.dominantColor);
      }
      const bits = [
        json.styleGuess,
        json.dominantColor !== "auto" ? json.dominantColor : null,
      ].filter(Boolean);
      toast({
        title: "Reference read",
        description: bits.length
          ? `Set ${bits.join(" · ")}`
          : "We'll use it as inspiration.",
      });
    } catch (err) {
      if (stale()) return;
      const aborted = err instanceof DOMException && err.name === "AbortError";
      toast({
        variant: "destructive",
        title: "Couldn't read the reference",
        description: aborted
          ? "It took too long. Describe it in the box above instead."
          : "Something went wrong. Describe it in the box above instead.",
      });
      setRefStatus("error");
    } finally {
      clearTimeout(timer);
    }
  }

  function handleClearReference() {
    refReqRef.current++; // cancel any in-flight read so it can't resurrect this
    setReference(null);
    setRefStatus("idle");
  }

  // Repopulate the whole form from a saved logo's params.
  function loadIntoCreator(params: GenParams) {
    setCompanyName(params.companyName);
    setLogoType(params.logoType);
    setSelectedStyle(params.selectedStyle);
    setPrimaryColor(params.primaryColor);
    setBackgroundColor(params.backgroundColor);
    setDetailLevel(params.detailLevel);
    setMonochrome(params.monochrome);
    setAdditionalInfo(params.additionalInfo);
    if (
      params.monochrome ||
      params.detailLevel !== "Balanced" ||
      params.additionalInfo
    ) {
      setShowAdvanced(true);
    }
    setHistoryOpen(false);
  }

  function handleDeleteLogo(id: string) {
    setGenerations((prev) => {
      const gone = prev.find((g) => g.id === id);
      if (gone?.image.startsWith("blob:")) URL.revokeObjectURL(gone.image);
      return prev.filter((g) => g.id !== id);
    });
    savePromises.current.delete(id);
    deleteLogo(id).catch(onPersistError);
  }

  function handleClearHistory() {
    const n = generations.length;
    generations.forEach((g) => {
      if (g.image.startsWith("blob:")) URL.revokeObjectURL(g.image);
    });
    setGenerations([]);
    clearLogos().catch(() => {});
    toast({
      title: "History cleared",
      description: `${n} ${n === 1 ? "logo" : "logos"} removed from this device.`,
    });
  }

  function dismissWelcome() {
    try {
      localStorage.setItem("lc_welcomed", "1");
    } catch {
      /* ignore */
    }
    setWelcomeOpen(false);
  }

  const creditCaption = hasOwnKey
    ? variationCount > 1
      ? `Using your key · ~${formatUsd(pricePerLogo(logoType) * variationCount)} / set`
      : `Using your key · ~${formatUsd(pricePerLogo(logoType))} / logo`
    : credits > 0
      ? `${credits} free ${credits === 1 ? "credit" : "credits"} left`
      : "Out of free credits";

  return (
    <MotionConfig reducedMotion="user">
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {liveMessage}
      </div>
      <div className="app-shell min-h-[100svh] md:h-[100svh] md:overflow-hidden">
        {/* ── Header ────────────────────────────────────── */}
        <header className="area-header flex items-center justify-between gap-2 border-b border-border/60 px-5 py-4 md:border-b-0 md:border-r">
          <Logo />
          <div className="flex items-center gap-1.5">
            <Tip label="Logo history" side="bottom">
              <button
                type="button"
                onClick={() => setHistoryOpen(true)}
                aria-label="Logo history"
                className="flex size-9 items-center justify-center rounded-full border border-border/70 text-muted-foreground transition-colors hover:border-border hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                <History className="size-[1.05rem]" />
              </button>
            </Tip>
            <ApiKeyDialog
              open={apiKeyOpen}
              onOpenChange={setApiKeyOpen}
              apiKey={userAPIKey}
              onSave={handleApiKeySave}
              credits={credits}
            />
            <ThemeToggle />
          </div>
        </header>

        {/* ── Controls ──────────────────────────────────── */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            runBatch(currentParams(), variationCount);
          }}
          aria-label="Logo settings"
          className="area-controls flex min-h-0 flex-col border-border md:overflow-hidden md:border-r"
        >
            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-3">
              <BrandImport
                onResult={handleBrandImport}
                imported={imported}
                onClear={() => {
                  importReqRef.current++; // cancel any in-flight import
                  setImported(null);
                }}
                onPickColor={pickImportedColor}
                disabled={isGenerating}
              />

              <div>
                <span className="label-eyebrow mb-2 block">Quick start</span>
                <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {STARTER_PRESETS.map((p) => {
                    const Icon = p.icon;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => applyPreset(p)}
                        aria-pressed={activePreset === p.id}
                        title={`${p.label}: ${p.style} style (seeds the whole form)`}
                        className={cn(
                          "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card",
                          activePreset === p.id
                            ? "border-primary bg-primary/10 text-foreground"
                            : "border-border bg-background text-muted-foreground hover:border-foreground/30 hover:text-foreground",
                        )}
                      >
                        <Icon aria-hidden className="size-3.5 shrink-0" />
                        {p.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label htmlFor="company-name" className="label-eyebrow mb-2 block">
                  Company name
                </label>
                <Input
                  id="company-name"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="Acme Inc."
                  required
                />
              </div>

              <div>
                <span className="label-eyebrow mb-2 block">
                  Describe it
                  <span className="ml-1 lowercase tracking-normal text-muted-foreground/60">
                    (optional)
                  </span>
                </span>
                <Textarea
                  value={additionalInfo}
                  onChange={(e) => {
                    setAdditionalInfo(e.target.value);
                    setActivePreset(null);
                  }}
                  placeholder="A fox, friendly and modern, with a subtle leaf…"
                />
                {additionalInfo.trim() === "" && (
                  <div className="-mx-1 mt-2 flex gap-1.5 overflow-x-auto px-1 pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    {DESCRIBE_SUGGESTIONS.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setAdditionalInfo(s)}
                        title={s}
                        className="shrink-0 whitespace-nowrap rounded-full border border-border bg-background px-2.5 py-1 text-[0.7rem] text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-card"
                      >
                        {s.length > 24 ? s.slice(0, 22) + "…" : s}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {reference && refStatus === "ready" && (
                <div className="flex w-fit items-center gap-1.5 rounded-full border border-border bg-secondary/50 px-2.5 py-1 text-xs">
                  <Sparkles className="size-3 text-primary" />
                  <span className="text-muted-foreground">
                    Inspired by reference
                  </span>
                  {reference.styleGuess && (
                    <span className="font-medium text-foreground">
                      · {reference.styleGuess}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={handleClearReference}
                    aria-label="Remove reference"
                    className="ml-0.5 text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <X className="size-3" />
                  </button>
                </div>
              )}

              <div>
                <span className="label-eyebrow mb-2 block">Logo type</span>
                <LogoTypeSelect
                  value={logoType}
                  onChange={(v) => {
                    setLogoType(v);
                    setActivePreset(null);
                  }}
                />
              </div>

              <div>
                <span className="label-eyebrow mb-2.5 block">Style</span>
                <StylePicker
                  styles={logoStyles}
                  value={selectedStyle}
                  onChange={(v) => {
                    setSelectedStyle(v);
                    setActivePreset(null);
                  }}
                />
              </div>

              <div>
                <div className="flex flex-wrap gap-x-10 gap-y-5">
                  <ColorSwatches
                    label="Brand color"
                    presets={primaryColors}
                    value={primaryColor}
                    onChange={(v) => {
                      setPrimaryColor(v);
                      setActivePreset(null);
                    }}
                  />
                  <ColorSwatches
                    label="Background"
                    presets={backgroundColors}
                    value={backgroundColor}
                    onChange={(v) => {
                      setBackgroundColor(v);
                      setActivePreset(null);
                    }}
                  />
                </div>
                <p className="mt-2.5 text-xs text-muted-foreground">
                  {primaryColor === "auto" || backgroundColor === "auto" ? (
                    <span className="flex items-center gap-1.5">
                      <Sparkles className="size-3.5 shrink-0 text-primary" />
                      AI will pick a fitting color. Regenerate for different
                      looks.
                    </span>
                  ) : contrastRatio(primaryColor, backgroundColor) < 1.6 ? (
                    <span className="flex items-center gap-1.5 text-amber-700 dark:text-amber-400">
                      <AlertTriangle className="size-3.5 shrink-0" />
                      Low contrast: your logo may be hard to see on this
                      background.
                    </span>
                  ) : (
                    "Colors your icon and name together."
                  )}
                </p>
              </div>

              <div>
                <button
                  type="button"
                  onClick={() => setShowAdvanced((v) => !v)}
                  className="label-eyebrow flex items-center gap-1 transition-colors hover:text-foreground"
                  aria-expanded={showAdvanced}
                >
                  <ChevronRight
                    className={cn(
                      "size-3 transition-transform duration-200",
                      showAdvanced && "rotate-90",
                    )}
                  />
                  Advanced
                  <span className="ml-1 lowercase tracking-normal text-muted-foreground/60">
                    (optional)
                  </span>
                </button>

                {showAdvanced && (
                  <div className="mt-3 space-y-4">
                    <div>
                      <span className="label-eyebrow mb-2 block">Detail</span>
                      <Segmented
                        options={detailLevels}
                        value={detailLevel}
                        onChange={setDetailLevel}
                        ariaLabel="Detail level"
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="label-eyebrow">Monochrome</span>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={monochrome}
                        aria-label="Monochrome"
                        onClick={() => setMonochrome((v) => !v)}
                        className={cn(
                          "relative h-5 w-9 shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card",
                          monochrome ? "bg-primary" : "bg-input",
                        )}
                      >
                        <span
                          className={cn(
                            "pointer-events-none absolute top-1/2 size-4 -translate-y-1/2 rounded-full bg-white shadow-sm transition-[left] duration-200 ease-out",
                            monochrome ? "left-[1.125rem]" : "left-0.5",
                          )}
                        />
                      </button>
                    </div>

                    <div>
                      <span className="label-eyebrow mb-2 block">
                        Reference logo
                      </span>
                      <ReferenceUpload
                        value={reference}
                        status={refStatus}
                        onFile={handleReferenceFile}
                        onClear={handleClearReference}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-3 border-t border-border px-5 py-4">
              <div className="flex items-center justify-between gap-3">
                <span className="label-eyebrow">Variations</span>
                <div className="w-[7rem]">
                  <Segmented
                    options={["1", "2", "4"]}
                    value={String(variationCount)}
                    onChange={(v) => setVariationCount(Number(v))}
                    ariaLabel="Number of variations"
                  />
                </div>
              </div>
              <div className="flex items-stretch gap-2">
                <Tip label="Feeling lucky" side="top">
                  <button
                    type="button"
                    onClick={handleLucky}
                    disabled={isGenerating}
                    aria-label="Feeling lucky: random style and AI-picked color"
                    className="flex w-12 shrink-0 items-center justify-center rounded-xl border border-border text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card disabled:pointer-events-none disabled:opacity-50"
                  >
                    <Dices className="size-5" />
                  </button>
                </Tip>
                <Button
                  type="submit"
                  size="lg"
                  disabled={isGenerating}
                  className="flex-1 rounded-xl text-[0.95rem] font-bold"
                >
                  {isGenerating ? (
                    <span className="spinner-ring size-4" />
                  ) : (
                    <Sparkles className="size-4" />
                  )}
                  {isGenerating
                    ? "Generating…"
                    : variationCount > 1
                      ? `Generate ${variationCount}`
                      : "Generate logo"}
                </Button>
              </div>

              <p className="text-center text-xs text-muted-foreground">
                <span
                  className={cn(
                    !hasOwnKey &&
                      credits <= 0 &&
                      "text-amber-700 dark:text-amber-400",
                  )}
                >
                  {creditCaption}
                </span>
                {!hasOwnKey && (
                  <>
                    {" · "}
                    <button
                      type="button"
                      onClick={() => setApiKeyOpen(true)}
                      className="font-medium text-foreground underline decoration-border underline-offset-2 transition-colors hover:decoration-foreground"
                    >
                      {credits <= 0 ? "Add your key" : "Use your key"}
                    </button>
                  </>
                )}
              </p>
            </div>
          </form>

        {/* ── Footer (bottom of the generation column) ──── */}
        <footer className="area-footer flex items-center justify-between gap-3 border-t border-border px-5 py-3.5">
          <TogetherCredit />
          <div className="flex items-center gap-0.5">
            <Tip label="What's this?">
              <button
                type="button"
                onClick={() => setWelcomeOpen(true)}
                aria-label="What's this?"
                className={socialLink}
              >
                <HelpCircle className="size-[1.05rem]" />
              </button>
            </Tip>
            <Tip label="GitHub">
              <a
                href="https://github.com/Nutlope/logocreator"
                target="_blank"
                rel="noreferrer"
                aria-label="GitHub"
                className={socialLink}
              >
                <Github className="size-[1.05rem]" />
              </a>
            </Tip>
            <Tip label="X (Twitter)">
              <a
                href="https://x.com/nutlope"
                target="_blank"
                rel="noreferrer"
                aria-label="X (Twitter)"
                className={socialLink}
              >
                <XLogo className="size-3.5" />
              </a>
            </Tip>
          </div>
        </footer>

        {/* ── Gallery ───────────────────────────────────── */}
        <main className="area-gallery relative min-h-0 overflow-y-auto border-b border-border/60 md:border-b-0">
          <Gallery
            generations={generations}
            pendingCount={pendingCount}
            onVary={(gen) => runBatch(gen.params, variationCount)}
            onOpen={(gen) => setActiveGen(gen)}
            onCreateBrandKit={handleCreateBrandKit}
            onToggleFavorite={toggleFavorite}
          />
        </main>
      </div>

      <GenerationModal
        gen={activeGen}
        editing={isEditing}
        busy={isGenerating}
        hasOwnKey={hasOwnKey}
        credits={credits}
        onClose={() => setActiveGen(null)}
        onRegenerate={(gen) => {
          setActiveGen(null);
          runGeneration(gen.params);
        }}
        onCreateBrandKit={handleCreateBrandKit}
        onEdit={runEdit}
        onToggleFavorite={toggleFavorite}
        onRename={renameLogo}
      />
      <BrandKitModal
        open={brandKit.open && !!brandKit.gen}
        gen={brandKit.gen}
        items={brandKit.items}
        palette={brandKit.palette}
        previews={brandKit.previews}
        prepareError={brandKit.prepareError}
        phase={brandKit.phase}
        doneCount={brandKit.doneCount}
        total={brandKit.total}
        zipping={brandKit.zipping}
        onMinimize={brandKit.minimize}
        onDiscard={brandKit.discard}
        onDownloadAll={brandKit.downloadAll}
        onBuild={brandKit.build}
        onRetry={brandKit.retry}
      />
      <BrandKitDock
        gen={brandKit.gen}
        visible={
          !!brandKit.gen && !brandKit.open && brandKit.phase !== "configure"
        }
        phase={brandKit.phase}
        doneCount={brandKit.doneCount}
        total={brandKit.total}
        onOpen={brandKit.show}
        onDiscard={brandKit.discard}
      />
      <HistoryDashboard
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        generations={generations}
        onOpen={(gen) => {
          setHistoryOpen(false);
          setActiveGen(gen);
        }}
        onCreateBrandKit={(gen) => {
          setHistoryOpen(false);
          handleCreateBrandKit(gen);
        }}
        onLoad={loadIntoCreator}
        onDelete={handleDeleteLogo}
        onClear={handleClearHistory}
        onToggleFavorite={toggleFavorite}
      />
      <WelcomeModal
        open={welcomeOpen}
        onOpenChange={(o) => {
          if (!o) dismissWelcome();
        }}
        apiKey={userAPIKey}
        onSave={handleApiKeySave}
        onStart={dismissWelcome}
      />
    </MotionConfig>
  );
}
