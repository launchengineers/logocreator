"use client";

import { useState } from "react";
import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import LogoTypePreview from "./LogoTypePreview";

export const LOGO_TYPES = [
  { key: "icon-name", label: "Icon + name" },
  { key: "icon", label: "Icon only" },
  { key: "wordmark", label: "Wordmark (text only)" },
  { key: "monogram", label: "Monogram" },
  { key: "emblem", label: "Emblem / badge" },
  { key: "abstract", label: "Abstract mark" },
] as const;

export default function LogoTypeSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  // The type whose structure preview is showing (follows hover + keyboard).
  const [preview, setPreview] = useState(value);

  return (
    <SelectPrimitive.Root
      value={value}
      onValueChange={onChange}
      onOpenChange={(o) => {
        if (o) setPreview(value);
      }}
    >
      <SelectPrimitive.Trigger
        aria-label="Logo type"
        className="flex h-11 w-full items-center justify-between whitespace-nowrap rounded-lg border border-input bg-background px-3.5 py-2 text-[0.9375rem] ring-offset-background transition-colors placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-[3px] focus:ring-ring/25 disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1"
      >
        <SelectPrimitive.Value />
        <SelectPrimitive.Icon asChild>
          <ChevronDown className="size-4 opacity-50" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>

      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          align="start"
          sideOffset={6}
          className="z-50 overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-lg data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2"
        >
          {/* Radix forces the Content to flex-column; this inner row puts the
              live preview panel to the right of the list. */}
          <div className="flex items-stretch">
            <SelectPrimitive.Viewport className="w-[var(--radix-select-trigger-width)] shrink-0 p-1.5">
              {LOGO_TYPES.map((t) => (
                <SelectPrimitive.Item
                  key={t.key}
                  value={t.key}
                  onPointerEnter={() => setPreview(t.key)}
                  onFocus={() => setPreview(t.key)}
                  className={cn(
                    "relative flex cursor-pointer select-none items-center justify-between rounded-lg py-2 pl-3 pr-8 text-sm outline-none transition-colors",
                    "data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground",
                    "data-[state=checked]:font-medium",
                  )}
                >
                  <SelectPrimitive.ItemText>{t.label}</SelectPrimitive.ItemText>
                  <SelectPrimitive.ItemIndicator className="absolute right-2.5 flex items-center">
                    <Check className="size-4 text-primary" />
                  </SelectPrimitive.ItemIndicator>
                </SelectPrimitive.Item>
              ))}
            </SelectPrimitive.Viewport>

            {/* Live structure preview, sits to the right of the list. */}
            <div className="hidden w-[16.5rem] shrink-0 border-l border-border bg-card p-4 md:block">
              <LogoTypePreview typeKey={preview} />
            </div>
          </div>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}
