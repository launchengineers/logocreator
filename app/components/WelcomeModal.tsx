"use client";

import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/app/components/ui/dialog";
import { Button } from "@/app/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { LogoMark } from "./Logo";
import ApiKeyForm from "./ApiKeyForm";
import DiagonalShowcase from "./DiagonalShowcase";

/**
 * First-visit showpiece: a wall of example logos scrolling diagonally behind a
 * welcome message, the free-credits pitch, and an optional (key-keeps-credits)
 * API-key field. Any close gesture dismisses it (the parent sets the seen flag).
 */
export default function WelcomeModal({
  open,
  onOpenChange,
  apiKey,
  onSave,
  onStart,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  apiKey: string;
  onSave: (key: string) => void;
  onStart: () => void;
}) {
  const [draft, setDraft] = useState(apiKey);
  useEffect(() => {
    if (open) setDraft(apiKey);
  }, [open, apiKey]);

  function start() {
    const k = draft.trim();
    // Same light shape check as the key dialog: a pasted fragment shouldn't
    // "save" silently and then 401 on the first generation.
    if (k && (/\s/.test(k) || k.length < 20)) {
      toast({
        variant: "destructive",
        title: "That doesn't look like an API key",
        description:
          "Check you copied the whole key, or clear the field to start with free credits.",
      });
      return;
    }
    if (k && k !== apiKey.trim()) onSave(k);
    onStart();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl gap-0 overflow-hidden rounded-2xl border-0 p-0 ring-1 ring-border sm:rounded-2xl">
        <div className="relative flex min-h-[34rem] items-center justify-center p-6 sm:p-10">
          <DiagonalShowcase />
          <div className="relative w-full max-w-sm rounded-2xl border border-border/60 bg-background/80 p-8 text-center shadow-2xl backdrop-blur-xl">
            <LogoMark className="mx-auto size-11" />
            <DialogTitle className="mt-5 text-2xl font-black tracking-tight sm:text-[1.75rem]">
              Design a logo in seconds.
            </DialogTitle>
            <DialogDescription className="mx-auto mt-2 max-w-xs text-pretty text-sm text-muted-foreground">
              Start with{" "}
              <span className="font-semibold text-foreground">
                3 free credits
              </span>
              , no account needed.
            </DialogDescription>

            <div className="mt-6 space-y-2 text-left">
              <ApiKeyForm value={draft} onChange={setDraft} onSubmit={start} />
              <p className="text-xs text-muted-foreground">
                Add your key for unlimited: you keep your 3 free credits.
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
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
