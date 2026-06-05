"use client";

import Image from "next/image";
import * as RadioGroup from "@radix-ui/react-radio-group";

type Style = { name: string; icon: string };

export default function StylePicker({
  styles,
  value,
  onChange,
}: {
  styles: Style[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <RadioGroup.Root
      value={value}
      onValueChange={onChange}
      className="grid grid-cols-3 gap-2.5"
    >
      {styles.map((style) => (
        <RadioGroup.Item
          key={style.name}
          value={style.name}
          className="group rounded-xl outline-none"
        >
          <span className="flex flex-col items-center gap-2.5 rounded-2xl border border-border bg-background px-2 py-3.5 transition-all duration-150 group-hover:border-foreground/25 group-focus-visible:ring-2 group-focus-visible:ring-ring group-focus-visible:ring-offset-2 group-focus-visible:ring-offset-card group-data-[state=checked]:border-primary group-data-[state=checked]:ring-2 group-data-[state=checked]:ring-primary/20">
            <Image
              src={style.icon}
              alt=""
              width={88}
              height={88}
              className="size-[3.25rem] rounded-xl"
            />
            <span className="text-xs font-medium text-muted-foreground transition-colors group-data-[state=checked]:text-foreground">
              {style.name}
            </span>
          </span>
        </RadioGroup.Item>
      ))}
    </RadioGroup.Root>
  );
}
