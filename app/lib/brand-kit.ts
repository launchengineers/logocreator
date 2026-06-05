import JSZip from "jszip";

/**
 * Brand-kit primitives. Deterministic, client-side (canvas) asset builders +
 * palette extraction + zip packaging. The modal orchestrates these so it can
 * reveal each asset live; AI variants (FLUX.1-kontext) are added separately.
 */

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load the logo image"));
    img.src = src;
  });
}

export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Canvas export failed"))),
      "image/png",
    );
  });
}

/** Best-effort transparent cut-out by keying out the (solid) corner color. */
export function makeTransparent(
  img: HTMLImageElement,
  tolerance = 26,
): HTMLCanvasElement {
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0, w, h);

  const image = ctx.getImageData(0, 0, w, h);
  const d = image.data;
  const corners = [0, (w - 1) * 4, (h - 1) * w * 4, (h * w - 1) * 4];
  let br = 0,
    bg = 0,
    bb = 0;
  for (const c of corners) {
    br += d[c];
    bg += d[c + 1];
    bb += d[c + 2];
  }
  br /= 4;
  bg /= 4;
  bb /= 4;

  const tol = tolerance * 3;
  for (let i = 0; i < d.length; i += 4) {
    const dist =
      Math.abs(d[i] - br) + Math.abs(d[i + 1] - bg) + Math.abs(d[i + 2] - bb);
    if (dist < tol) d[i + 3] = 0;
    else if (dist < tol * 2) d[i + 3] = Math.round((d[i + 3] * (dist - tol)) / tol);
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

/** Recolor every opaque pixel of a (transparent) canvas to a single color. */
function recolor(src: HTMLCanvasElement, color: string): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = src.width;
  c.height = src.height;
  const ctx = c.getContext("2d")!;
  ctx.drawImage(src, 0, 0);
  ctx.globalCompositeOperation = "source-in";
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, c.width, c.height);
  return c;
}

/** Draw a source contained + centered onto a w×h canvas, optional bg fill. */
export function scaleOnto(
  source: HTMLImageElement | HTMLCanvasElement,
  w: number,
  h: number,
  bg: string | null,
  pad: number,
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  if (bg) {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
  }
  const sw = (source as HTMLImageElement).naturalWidth || source.width;
  const sh = (source as HTMLImageElement).naturalHeight || source.height;
  const avail = Math.min(w, h) * (1 - pad);
  const scale = avail / Math.max(sw, sh);
  const dw = sw * scale;
  const dh = sh * scale;
  ctx.drawImage(source, (w - dw) / 2, (h - dh) / 2, dw, dh);
  return canvas;
}

/** Pull a small, distinct brand palette out of the logo. */
export function extractPalette(img: HTMLImageElement, count = 6): string[] {
  const w = 48;
  const h = 48;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  ctx.drawImage(img, 0, 0, w, h);
  const d = ctx.getImageData(0, 0, w, h).data;

  const buckets = new Map<string, { n: number; r: number; g: number; b: number }>();
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 128) continue;
    const r = d[i];
    const g = d[i + 1];
    const b = d[i + 2];
    const key = `${r >> 5}-${g >> 5}-${b >> 5}`;
    const e = buckets.get(key) || { n: 0, r: 0, g: 0, b: 0 };
    e.n++;
    e.r += r;
    e.g += g;
    e.b += b;
    buckets.set(key, e);
  }

  const sorted = Array.from(buckets.values())
    .sort((a, b) => b.n - a.n)
    .map((e) => ({
      r: Math.round(e.r / e.n),
      g: Math.round(e.g / e.n),
      b: Math.round(e.b / e.n),
    }));

  const picked: { r: number; g: number; b: number }[] = [];
  for (const col of sorted) {
    if (picked.length >= count) break;
    if (
      picked.every(
        (p) =>
          Math.abs(p.r - col.r) + Math.abs(p.g - col.g) + Math.abs(p.b - col.b) >
          40,
      )
    ) {
      picked.push(col);
    }
  }
  return picked.map(
    (col) =>
      "#" +
      [col.r, col.g, col.b].map((x) => x.toString(16).padStart(2, "0")).join(""),
  );
}

export type AssetSpec = {
  group: string;
  name: string;
  filename: string;
  build: () => Promise<Blob>;
};

/** The deterministic (always-available) brand-kit assets. */
export function deterministicAssetSpecs(
  img: HTMLImageElement,
  transparent: HTMLCanvasElement,
): AssetSpec[] {
  const png = (canvas: HTMLCanvasElement) => () => canvasToBlob(canvas);

  const variants: AssetSpec[] = [
    {
      group: "Variants",
      name: "Transparent",
      filename: "variants/logo-transparent.png",
      build: png(scaleOnto(transparent, 1024, 1024, null, 0)),
    },
    {
      group: "Variants",
      name: "Monochrome black",
      filename: "variants/monochrome-black.png",
      build: png(scaleOnto(recolor(transparent, "#000000"), 1024, 1024, null, 0.06)),
    },
    {
      group: "Variants",
      name: "Monochrome white",
      filename: "variants/monochrome-white.png",
      build: png(scaleOnto(recolor(transparent, "#ffffff"), 1024, 1024, null, 0.06)),
    },
    {
      group: "Variants",
      name: "On light",
      filename: "variants/logo-on-light.png",
      build: png(scaleOnto(transparent, 1024, 1024, "#ffffff", 0.12)),
    },
    {
      group: "Variants",
      name: "On dark",
      filename: "variants/logo-on-dark.png",
      build: png(scaleOnto(transparent, 1024, 1024, "#0c0c0b", 0.12)),
    },
    {
      group: "Variants",
      name: "Original",
      filename: "variants/logo-original.png",
      build: png(scaleOnto(img, 1024, 1024, null, 0)),
    },
  ];

  const iconSizes: [number, string][] = [
    [16, "icons/favicon-16x16.png"],
    [32, "icons/favicon-32x32.png"],
    [48, "icons/favicon-48x48.png"],
    [180, "icons/apple-touch-icon-180.png"],
    [192, "icons/icon-192x192.png"],
    [512, "icons/icon-512x512.png"],
    [1024, "icons/icon-1024.png"],
  ];
  const icons: AssetSpec[] = iconSizes.map(([s, filename]) => ({
    group: "Favicons & icons",
    name: filename.split("/")[1].replace(".png", ""),
    filename,
    build: png(scaleOnto(transparent, s, s, null, 0)),
  }));

  const social: AssetSpec[] = [
    {
      group: "Social",
      name: "Avatar 400",
      filename: "social/avatar-400.png",
      build: png(scaleOnto(transparent, 400, 400, null, 0.08)),
    },
    {
      group: "Social",
      name: "Open Graph 1200×630",
      filename: "social/og-1200x630.png",
      build: png(scaleOnto(transparent, 1200, 630, "#ffffff", 0.34)),
    },
  ];

  return [...variants, ...icons, ...social];
}

export function paletteFiles(palette: string[]): { css: string; json: string } {
  const css =
    ":root {\n" +
    palette.map((hex, i) => `  --brand-${i + 1}: ${hex};`).join("\n") +
    "\n}\n";
  const json = JSON.stringify(
    palette.reduce<Record<string, string>>((acc, hex, i) => {
      acc[`brand-${i + 1}`] = hex;
      return acc;
    }, {}),
    null,
    2,
  );
  return { css, json };
}

export function readme(companyName: string, palette: string[]): string {
  const name = companyName || "Your logo";
  return `${name} — brand kit\nGenerated with LogoCreator.\n\nFOLDERS\n  variants/   transparent, monochrome (black/white), on-light, on-dark, original (1024)\n  icons/      favicons + app icons (16/32/48/180/192/512/1024)\n  social/     avatar (400) and Open Graph (1200x630)\n  ai/         AI-generated variants (lockup, icon-only) — when available\n  brand-colors.css / .json — extracted palette: ${palette.join(", ")}\n\nQUICK USE\n  - Favicon:   icons/favicon-32x32.png, favicon-16x16.png\n  - iOS:       icons/apple-touch-icon-180.png\n  - PWA/app:   icons/icon-192x192.png, icon-512x512.png\n  - Link card: social/og-1200x630.png\n`;
}

export async function zipFiles(
  files: { path: string; data: Blob | string }[],
): Promise<Blob> {
  const zip = new JSZip();
  for (const f of files) zip.file(f.path, f.data);
  return zip.generateAsync({
    type: "blob",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "logo"
  );
}
