"use client";

import { useEffect, useState } from "react";
import { ArrowRight, KeyRound, Sparkles } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/app/components/ui/dialog";
import { Button } from "@/app/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { LogoMark } from "./Logo";
import ApiKeyForm from "./ApiKeyForm";
import DiagonalShowcase from "./DiagonalShowcase";

/**
 * First-visit showpiece: a wall of example logos scrolling diagonally behind
 * the welcome pitch. With Clerk configured and the visitor signed out, signing
 * in is the primary CTA (an account is the friction gate for the free credits,
 * since image models cost real money); bringing your own Together key stays
 * available as a collapsed secondary path, and browsing without either is a
 * quiet last option. Signed in, or in account-less mode, it's the classic
 * "start creating" welcome. Any close gesture dismisses it for good.
 */
export default function WelcomeModal({
  open,
  onOpenChange,
  apiKey,
  onSave,
  onStart,
  freeCredits,
  needsSignIn,
  signedIn,
  onSignIn,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  apiKey: string;
  onSave: (key: string) => void;
  onStart: () => void;
  /** How many free generations a (new) account gets. */
  freeCredits: number;
  /** Clerk is configured and the visitor is signed out: lead with sign-in. */
  needsSignIn: boolean;
  /** Clerk is configured and the visitor is already signed in (copy only). */
  signedIn: boolean;
  onSignIn: () => void;
}) {
  const [draft, setDraft] = useState(apiKey);
  // The BYOK field starts collapsed in the sign-in variant so one clear CTA
  // leads; it's always expanded in the classic variant.
  const [showKey, setShowKey] = useState(false);
  useEffect(() => {
    if (open) {
      setDraft(apiKey);
      setShowKey(false);
    }
  }, [open, apiKey]);

  function start() {
    const k = draft.trim();
    // Same light shape check as the key dialog: a pasted fragment shouldn't
    // "save" silently and then 401 on the first generation.
    if (k && (/\s/.test(k) || k.length < 20)) {
      toast({
        variant: "destructive",
        title: "That doesn't look like an API key",
        description: needsSignIn
          ? "Check you copied the whole key, or sign in to use free credits instead."
          : "Check you copied the whole key, or clear the field to start with free credits.",
      });
      return;
    }
    if (k && k !== apiKey.trim()) onSave(k);
    onStart();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl gap-0 overflow-hidden rounded-2xl border-0 p-0 ring-1 ring-border sm:rounded-2xl">
        <div className="relative flex min-h-[26rem] items-center justify-center p-5 sm:min-h-[34rem] sm:p-10">
          <DiagonalShowcase />
          <div className="relative w-full max-w-sm rounded-2xl border border-border/60 bg-background/80 p-8 text-center shadow-2xl backdrop-blur-xl">
            <LogoMark className="mx-auto size-11" />
            <DialogTitle className="mt-5 text-2xl font-black tracking-tight sm:text-[1.75rem]">
              Design a logo in seconds.
            </DialogTitle>

            {needsSignIn ? (
              <>
                <DialogDescription className="mx-auto mt-2 max-w-xs text-pretty text-sm text-muted-foreground">
                  Create a free account and get{" "}
                  <span className="font-semibold text-foreground">
                    {freeCredits} free logo generations
                  </span>
                  . No card needed.
                </DialogDescription>

                <Button
                  onClick={onSignIn}
                  size="lg"
                  className="mt-6 w-full rounded-xl text-[0.95rem] font-bold"
                >
                  <Sparkles className="size-4" />
                  Sign in for {freeCredits} free credits
                </Button>
                <p className="mt-2 text-xs text-muted-foreground">
                  Takes seconds. Your logos stay on this device.
                </p>

                <div className="mt-5 flex items-center gap-3" aria-hidden>
                  <span className="h-px flex-1 bg-border" />
                  <span className="text-[0.6875rem] font-medium uppercase tracking-[0.04em] text-muted-foreground">
                    or
                  </span>
                  <span className="h-px flex-1 bg-border" />
                </div>

                {showKey ? (
                  <div className="mt-4 space-y-3 text-left">
                    <ApiKeyForm
                      value={draft}
                      onChange={setDraft}
                      onSubmit={start}
                      autoFocus
                    />
                    <Button
                      onClick={start}
                      variant="secondary"
                      className="w-full rounded-xl font-semibold"
                    >
                      Start with your key
                      <ArrowRight className="size-4" />
                    </Button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowKey(true)}
                    className={cn(
                      "mt-4 flex w-full items-center justify-center gap-1.5 rounded-xl border border-border px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors",
                      "hover:border-foreground/30 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    )}
                  >
                    <KeyRound className="size-3.5" />
                    Use your own Together AI key
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => onOpenChange(false)}
                  className="mt-4 text-xs text-muted-foreground underline decoration-border underline-offset-4 transition-colors hover:text-foreground"
                >
                  Just browsing? Skip for now
                </button>
              </>
            ) : (
              <>
                <DialogDescription className="mx-auto mt-2 max-w-xs text-pretty text-sm text-muted-foreground">
                  {signedIn ? (
                    <>
                      You&apos;re in! Your{" "}
                      <span className="font-semibold text-foreground">
                        {freeCredits} free credits
                      </span>{" "}
                      are ready.
                    </>
                  ) : (
                    <>
                      Start with{" "}
                      <span className="font-semibold text-foreground">
                        {freeCredits} free credits
                      </span>
                      {", "}
                      no account needed.
                    </>
                  )}
                </DialogDescription>

                <div className="mt-6 space-y-2 text-left">
                  <ApiKeyForm
                    value={draft}
                    onChange={setDraft}
                    onSubmit={start}
                  />
                  <p className="text-xs text-muted-foreground">
                    Add your key for unlimited: you keep your {freeCredits} free
                    credits.
                  </p>
                </div>

                <Button
                  onClick={start}
                  size="lg"
                  className="mt-6 w-full rounded-xl text-[0.95rem] font-bold"
                >
                  Start creating
                  <ArrowRight className="size-4" />
                </Button>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
