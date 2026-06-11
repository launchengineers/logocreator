import { loadImage } from "./brand-kit";

/**
 * Vectorize a (flat, limited-color) raster logo to an SVG string by tracing it
 * on-device with imagetracerjs. Tuned for clean logo art: a small color count,
 * speckle removal, fills-only (no strokes), and a light blur to tame the JPEG/AA
 * edges. This is an auto-trace, not a hand-redraw: good enough for scalable
 * exports of these flat marks.
 */
const LOGO_TRACE_OPTS = {
  numberofcolors: 10,
  colorquantcycles: 3,
  mincolorratio: 0,
  pathomit: 24, // drop tiny paths, kills background speckle
  ltres: 1,
  qtres: 1,
  strokewidth: 0,
  linefilter: true,
  roundcoords: 2,
  blurradius: 2,
  blurdelta: 20,
  // Emit `<svg viewBox="0 0 w h">` with NO fixed width/height so the export
  // actually scales into a favicon slot, a CSS-sized <img>, or a print sheet.
  viewbox: true,
};

/**
 * Flatten a near-uniform background to one exact color before tracing. FLUX
 * outputs a "white" background that's actually full of faint noise, which the
 * tracer would otherwise turn into hundreds of tiny speckle paths. Snapping
 * every pixel within tolerance of the corner-sampled background to that single
 * color collapses it into one clean region.
 */
function flattenBackground(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const image = ctx.getImageData(0, 0, w, h);
  const d = image.data;
  // Sample only OPAQUE corners: a transparent corner's RGB is usually (0,0,0)
  // and would drag the reference toward black. The caller fills white first,
  // so this is belt-and-braces, but the shared pattern must stay alpha-aware
  // (the alpha-blind version of this is exactly what broke makeTransparent).
  const corners = [0, (w - 1) * 4, (h - 1) * w * 4, (h * w - 1) * 4];
  let br = 0,
    bg = 0,
    bb = 0,
    nc = 0;
  for (const c of corners) {
    if (d[c + 3] < 200) continue;
    br += d[c];
    bg += d[c + 1];
    bb += d[c + 2];
    nc++;
  }
  if (nc === 0) return; // nothing opaque to key against
  br = Math.round(br / nc);
  bg = Math.round(bg / nc);
  bb = Math.round(bb / nc);
  const tol = 60 * 3; // generous: noisy "white" varies a fair bit
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 24) {
      // transparent → treat as the flat background too
      d[i] = br;
      d[i + 1] = bg;
      d[i + 2] = bb;
      d[i + 3] = 255;
      continue;
    }
    const dist =
      Math.abs(d[i] - br) + Math.abs(d[i + 1] - bg) + Math.abs(d[i + 2] - bb);
    if (dist < tol) {
      d[i] = br;
      d[i + 1] = bg;
      d[i + 2] = bb;
    }
  }
  ctx.putImageData(image, 0, 0);
}

export async function logoToSvgString(src: string): Promise<string> {
  // Lazy-loaded: imagetracerjs is ~3.2MB and only needed on an SVG export click,
  // so it stays out of the first-load bundle.
  const { default: ImageTracer } = await import("imagetracerjs");
  const img = await loadImage(src);
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas unavailable");
  // Opaque white base so transparent inputs flatten cleanly.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  flattenBackground(ctx, w, h);
  const imgdata = ctx.getImageData(0, 0, w, h);
  return ImageTracer.imagedataToSVG(imgdata, LOGO_TRACE_OPTS);
}

export async function logoToSvgBlob(src: string): Promise<Blob> {
  const svg = await logoToSvgString(src);
  return new Blob([svg], { type: "image/svg+xml" });
}
