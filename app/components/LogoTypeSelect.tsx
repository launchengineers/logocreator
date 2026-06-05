"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/app/components/ui/select";

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
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label="Logo type">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {LOGO_TYPES.map((t) => (
          <SelectItem key={t.key} value={t.key}>
            {t.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
