"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronRight, Github, Sparkles } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Textarea } from "@/app/components/ui/textarea";
import Logo from "./components/Logo";
import ThemeToggle from "./components/ThemeToggle";
import ApiKeyDialog from "./components/ApiKeyDialog";
import StylePicker from "./components/StylePicker";
import ColorSwatches from "./components/ColorSwatches";
import Segmented from "./components/Segmented";
import LogoTypeSelect, { LOGO_TYPES } from "./components/LogoTypeSelect";
import TogetherCredit from "./components/TogetherCredit";
import GenerationModal from "./components/GenerationModal";
import BrandKitModal from "./components/BrandKitModal";
import Gallery, { type GenParams, type Generation } from "./components/Gallery";

const FREE_CREDITS = 3;

const logoStyles = [
  { name: "Tech", icon: "/tech.svg" },
  { name: "Flashy", icon: "/flashy.svg" },
  { name: "Modern", icon: "/modern.svg" },
  { name: "Playful", icon: "/playful.svg" },
  { name: "Abstract", icon: "/abstract.svg" },
  { name: "Minimal", icon: "/minimal.svg" },
];

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
  const [primaryColor, setPrimaryColor] = useState(primaryColors[0].color);
  const [backgroundColor, setBackgroundColor] = useState(
    backgroundColors[0].color,
  );
  const [detailLevel, setDetailLevel] = useState<string>("Balanced");
  const [monochrome, setMonochrome] = useState(false);
  const [additionalInfo, setAdditionalInfo] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Account-less state
  const [userAPIKey, setUserAPIKey] = useState("");
  const [credits, setCredits] = useState(FREE_CREDITS);
  const [apiKeyOpen, setApiKeyOpen] = useState(false);

  // Generation state
  const [isLoading, setIsLoading] = useState(false);
  const [generations, setGenerations] = useState<Generation[]>([]);
  const idRef = useRef(0);

  // Modals
  const [activeGen, setActiveGen] = useState<Generation | null>(null);
  const [brandKitGen, setBrandKitGen] = useState<Generation | null>(null);
  const [pendingBrandKitGen, setPendingBrandKitGen] =
    useState<Generation | null>(null);

  // Load persisted key + credits after mount (avoids hydration mismatches).
  useEffect(() => {
    setUserAPIKey(localStorage.getItem("userAPIKey") || "");
    const stored = localStorage.getItem("lc_credits");
    if (stored !== null) setCredits(Math.max(0, parseInt(stored, 10) || 0));
  }, []);

  const hasOwnKey = userAPIKey.trim().length > 0;

  function persistCredits(n: number) {
    setCredits(n);
    localStorage.setItem("lc_credits", String(n));
  }

  function handleApiKeySave(key: string) {
    setUserAPIKey(key);
    localStorage.setItem("userAPIKey", key);
    // If they were trying to make a brand kit, continue into it now.
    if (key.trim() && pendingBrandKitGen) {
      setBrandKitGen(pendingBrandKitGen);
      setPendingBrandKitGen(null);
    }
  }

  // Brand kit always requires the user's own key.
  function handleCreateBrandKit(gen: Generation) {
    setActiveGen(null);
    if (userAPIKey.trim()) {
      setBrandKitGen(gen);
    } else {
      setPendingBrandKitGen(gen);
      setApiKeyOpen(true);
    }
  }

  async function runGeneration(params: GenParams) {
    // Out of free credits and no key → prompt for a key instead of generating.
    if (!hasOwnKey && credits <= 0) {
      setApiKeyOpen(true);
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch("/api/generate-logo", {
        method: "POST",
        body: JSON.stringify({ userAPIKey, ...params }),
      });

      if (res.ok) {
        const json = await res.json();
        idRef.current += 1;
        setGenerations((prev) => [
          {
            id: `g${idRef.current}`,
            image: `data:image/png;base64,${json.b64_json}`,
            companyName: params.companyName,
            params,
          },
          ...prev,
        ]);
        if (!hasOwnKey) persistCredits(Math.max(0, credits - 1));
      } else if (res.headers.get("Content-Type") === "text/plain") {
        toast({
          variant: "destructive",
          title: res.statusText,
          description: await res.text(),
        });
      } else {
        toast({
          variant: "destructive",
          title: "Whoops!",
          description: `There was a problem processing your request: ${res.statusText}`,
        });
      }
    } catch {
      toast({
        variant: "destructive",
        title: "Whoops!",
        description: "Something went wrong. Please try again.",
      });
    } finally {
      setIsLoading(false);
    }
  }

  function currentParams(): GenParams {
    return {
      companyName,
      selectedStyle,
      logoType,
      primaryColor,
      backgroundColor,
      detailLevel,
      monochrome,
      additionalInfo,
    };
  }

  const creditCaption = hasOwnKey
    ? "Using your API key — unlimited"
    : credits > 0
      ? `${credits} free ${credits === 1 ? "credit" : "credits"} left`
      : "Out of free credits";

  return (
    <div className="flex min-h-[100svh] flex-col md:h-[100svh] md:overflow-hidden">
      <div className="flex flex-1 flex-col md:flex-row md:overflow-hidden">
        {/* ── Control panel ─────────────────────────────── */}
        <aside className="flex w-full shrink-0 flex-col border-border md:w-[21rem] md:border-r lg:w-[23.5rem]">
          <div className="flex items-center justify-between gap-2 px-5 pb-3 pt-5">
            <Logo />
            <div className="flex items-center gap-1.5">
              <ApiKeyDialog
                open={apiKeyOpen}
                onOpenChange={setApiKeyOpen}
                apiKey={userAPIKey}
                onSave={handleApiKeySave}
                credits={credits}
              />
              <ThemeToggle />
            </div>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              runGeneration(currentParams());
            }}
            className="flex min-h-0 flex-1 flex-col"
          >
            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-3">
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
                <span className="label-eyebrow mb-2 block">Logo type</span>
                <LogoTypeSelect value={logoType} onChange={setLogoType} />
              </div>

              <div>
                <span className="label-eyebrow mb-2.5 block">Style</span>
                <StylePicker
                  styles={logoStyles}
                  value={selectedStyle}
                  onChange={setSelectedStyle}
                />
              </div>

              <div className="flex flex-wrap gap-x-10 gap-y-5">
                <ColorSwatches
                  label="Primary"
                  presets={primaryColors}
                  value={primaryColor}
                  onChange={setPrimaryColor}
                />
                <ColorSwatches
                  label="Background"
                  presets={backgroundColors}
                  value={backgroundColor}
                  onChange={setBackgroundColor}
                />
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
                          "relative h-5 w-9 shrink-0 rounded-full transition-colors",
                          monochrome ? "bg-primary" : "bg-input",
                        )}
                      >
                        <span
                          className={cn(
                            "absolute top-0.5 size-4 rounded-full bg-white transition-transform duration-200",
                            monochrome
                              ? "translate-x-[1.125rem]"
                              : "translate-x-0.5",
                          )}
                        />
                      </button>
                    </div>

                    <div>
                      <span className="label-eyebrow mb-2 block">Details</span>
                      <Textarea
                        value={additionalInfo}
                        onChange={(e) => setAdditionalInfo(e.target.value)}
                        placeholder="Symbols to include, mood, things to avoid…"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-3 border-t border-border px-5 py-4">
              <Button
                type="submit"
                size="lg"
                disabled={isLoading}
                className="w-full rounded-xl text-[0.95rem] font-bold"
              >
                {isLoading ? (
                  <span className="spinner-ring size-4" />
                ) : (
                  <Sparkles className="size-4" />
                )}
                {isLoading ? "Generating…" : "Generate logo"}
              </Button>

              <p className="text-center text-xs text-muted-foreground">
                <span className={cn(!hasOwnKey && credits <= 0 && "text-amber-500")}>
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

              <div className="flex items-center justify-between">
                <TogetherCredit />
                <div className="flex items-center gap-0.5">
                  <a
                    href="https://github.com/Nutlope/logocreator"
                    target="_blank"
                    rel="noreferrer"
                    aria-label="GitHub"
                    className={socialLink}
                  >
                    <Github className="size-[1.05rem]" />
                  </a>
                  <a
                    href="https://x.com/nutlope"
                    target="_blank"
                    rel="noreferrer"
                    aria-label="X (Twitter)"
                    className={socialLink}
                  >
                    <XLogo className="size-3.5" />
                  </a>
                </div>
              </div>
            </div>
          </form>
        </aside>

        {/* ── Generations gallery ───────────────────────── */}
        <main className="relative flex-1 md:overflow-y-auto">
          <Gallery
            generations={generations}
            isLoading={isLoading}
            onRegenerate={(gen) => runGeneration(gen.params)}
            onOpen={(gen) => setActiveGen(gen)}
          />
        </main>
      </div>

      <GenerationModal
        gen={activeGen}
        onClose={() => setActiveGen(null)}
        onRegenerate={(gen) => {
          setActiveGen(null);
          runGeneration(gen.params);
        }}
        onCreateBrandKit={handleCreateBrandKit}
      />
      <BrandKitModal
        gen={brandKitGen}
        apiKey={userAPIKey}
        onClose={() => setBrandKitGen(null)}
      />
    </div>
  );
}
