import { z } from "zod";

// Pulls a brand's name, accent color and existing logo from a website URL so the
// creator can pre-fill the form and design a fresh logo in their colors. Pure
// HTML/metadata parsing: no AI, no credits. Node runtime for clean binary→base64.
export const runtime = "nodejs";

const MAX_HTML_BYTES = 768 * 1024;
const MAX_IMG_BYTES = 3 * 1024 * 1024;
const FETCH_TIMEOUT = 8000;

// SSRF guard: refuse loopback / private / link-local / metadata hosts so this
// can't be used to probe internal services. Checked on the initial URL *and*
// the post-redirect URL.
function isBlockedHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    h === "localhost" ||
    h.endsWith(".local") ||
    h.endsWith(".internal") ||
    h === "metadata.google.internal"
  ) {
    return true;
  }
  // IPv6 loopback / unique-local / link-local.
  if (h === "::1" || h.startsWith("fc") || h.startsWith("fd") || h.startsWith("fe80")) {
    return true;
  }
  // IPv4 literals in private / loopback / link-local / metadata ranges.
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true; // link-local + cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
  }
  return false;
}

function normalizeUrl(input: string): URL | null {
  let raw = input.trim();
  if (!raw) return null;
  if (!/^https?:\/\//i.test(raw)) raw = `https://${raw}`;
  try {
    const u = new URL(raw);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (isBlockedHost(u.hostname)) return null;
    return u;
  } catch {
    return null;
  }
}

async function fetchWithTimeout(url: string, ms: number, asText: boolean) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: {
        // Some sites serve minimal HTML to non-browser agents.
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        Accept: asText ? "text/html,application/xhtml+xml" : "image/*,*/*",
      },
    });
  } finally {
    clearTimeout(t);
  }
}

// Read at most `cap` bytes from a response body (defends against huge pages).
async function readCapped(res: Response, cap: number): Promise<Uint8Array> {
  const reader = res.body?.getReader();
  if (!reader) return new Uint8Array(await res.arrayBuffer());
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      total += value.length;
      if (total >= cap) {
        reader.cancel();
        break;
      }
    }
  }
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c.subarray(0, Math.min(c.length, out.length - off)), off);
    off += c.length;
  }
  return out;
}

// Pull one attribute value out of a single tag string.
function attr(tag: string, name: string): string | null {
  const q = tag.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, "i"));
  if (q) return q[1].trim();
  const bare = tag.match(new RegExp(`\\b${name}\\s*=\\s*([^\\s"'>]+)`, "i"));
  return bare ? bare[1].trim() : null;
}

function metaContent(html: string, keys: string[]): string | null {
  const tags = html.match(/<meta\b[^>]*>/gi) || [];
  for (const t of tags) {
    const prop = (attr(t, "property") || attr(t, "name") || "").toLowerCase();
    if (keys.includes(prop)) {
      const c = attr(t, "content");
      if (c) return c;
    }
  }
  return null;
}

// All <link> hrefs whose rel matches, with any sizes hint (for picking biggest).
function linkIcons(html: string, relIncludes: string): { href: string; size: number }[] {
  const tags = html.match(/<link\b[^>]*>/gi) || [];
  const out: { href: string; size: number }[] = [];
  for (const t of tags) {
    const rel = (attr(t, "rel") || "").toLowerCase();
    if (!rel.includes(relIncludes)) continue;
    if (rel.includes("mask-icon")) continue; // monochrome svg, not useful for color
    const href = attr(t, "href");
    if (!href) continue;
    const sizes = attr(t, "sizes") || "";
    const size = parseInt(sizes.split("x")[0], 10) || 0;
    out.push({ href, size });
  }
  return out;
}

function cleanName(raw: string | null): string | null {
  if (!raw) return null;
  // Take the brand part before a separator ("Acme | Best widgets" → "Acme").
  const first = raw.split(/\s*[|\u2013\u2014·:\-]\s+/)[0].trim();
  const name = (first || raw).trim();
  if (!name || name.length > 60) return name.slice(0, 60) || null;
  return name;
}

function validHex(c: string | null): string | null {
  if (!c) return null;
  const m = c.trim().match(/^#?([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/);
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split("").map((x) => x + x).join("");
  return `#${h.toUpperCase()}`;
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const parsed = z.object({ url: z.string() }).safeParse(body);
  if (!parsed.success) {
    return new Response("Enter a website URL.", {
      status: 400,
      headers: { "Content-Type": "text/plain" },
    });
  }

  const url = normalizeUrl(parsed.data.url);
  if (!url) {
    return new Response("That doesn't look like a valid public website URL.", {
      status: 400,
      headers: { "Content-Type": "text/plain" },
    });
  }

  let res: Response;
  try {
    res = await fetchWithTimeout(url.href, FETCH_TIMEOUT, true);
  } catch {
    return new Response("Couldn't reach that site. Check the URL and try again.", {
      status: 502,
      headers: { "Content-Type": "text/plain" },
    });
  }
  // Re-check the host after any redirects (defeats redirect-to-internal SSRF).
  try {
    if (isBlockedHost(new URL(res.url).hostname)) {
      return new Response("That URL isn't allowed.", {
        status: 400,
        headers: { "Content-Type": "text/plain" },
      });
    }
  } catch {
    /* keep going with the original host */
  }
  if (!res.ok) {
    return new Response(`That site returned an error (${res.status}).`, {
      status: 502,
      headers: { "Content-Type": "text/plain" },
    });
  }

  let html: string;
  try {
    const htmlBytes = await readCapped(res, MAX_HTML_BYTES);
    html = new TextDecoder("utf-8").decode(htmlBytes);
  } catch {
    return new Response("Couldn't read that site. Try again.", {
      status: 502,
      headers: { "Content-Type": "text/plain" },
    });
  }
  const base = res.url || url.href;

  const name =
    cleanName(metaContent(html, ["og:site_name"])) ||
    cleanName(metaContent(html, ["og:title", "application-name"])) ||
    cleanName((html.match(/<title[^>]*>([^<]*)<\/title>/i) || [])[1] || null) ||
    cleanName(url.hostname.replace(/^www\./, "").split(".")[0]);

  const themeColor = validHex(metaContent(html, ["theme-color"]));

  // Logo candidates, best first. Prefer the actual brand mark (apple-touch-icon
  // / declared favicon / /favicon.ico) over the social og:image, which is often
  // a marketing banner whose colors aren't the brand color. og:image is the last
  // resort so we still get *something* for sites with no discoverable favicon.
  const apple = linkIcons(html, "apple-touch-icon").sort((a, b) => b.size - a.size)[0]?.href;
  const favicon = linkIcons(html, "icon").sort((a, b) => b.size - a.size)[0]?.href;
  const ogImage = metaContent(html, ["og:image", "og:image:url"]);
  const candidates = [apple, favicon, "/favicon.ico", ogImage].filter(
    Boolean,
  ) as string[];

  let logoDataUrl: string | null = null;
  for (const cand of candidates) {
    let abs: string;
    try {
      abs = new URL(cand, base).href;
    } catch {
      continue;
    }
    try {
      const u = new URL(abs);
      if (isBlockedHost(u.hostname)) continue;
      const imgRes = await fetchWithTimeout(abs, FETCH_TIMEOUT, false);
      if (!imgRes.ok) continue;
      const ct = (imgRes.headers.get("content-type") || "").split(";")[0].trim();
      if (!ct.startsWith("image/")) continue;
      const bytes = await readCapped(imgRes, MAX_IMG_BYTES);
      if (bytes.length < 64) continue; // empty / 1px tracker
      const b64 = Buffer.from(bytes).toString("base64");
      logoDataUrl = `data:${ct};base64,${b64}`;
      break;
    } catch {
      continue;
    }
  }

  return Response.json({
    name: name || null,
    themeColor,
    logoDataUrl,
    sourceUrl: url.hostname.replace(/^www\./, ""),
  });
}
