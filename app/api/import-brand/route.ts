import { z } from "zod";
import dns from "node:dns/promises";

// Pulls a brand's name, accent color and existing logo from a website URL so the
// creator can pre-fill the form and design a fresh logo in their colors. Pure
// HTML/metadata parsing: no AI, no credits. Node runtime for clean binary→base64.
export const runtime = "nodejs";

const MAX_HTML_BYTES = 768 * 1024;
const MAX_IMG_BYTES = 3 * 1024 * 1024;
const FETCH_TIMEOUT = 8000;
// Per-icon-candidate timeout + a whole-request budget. The client aborts at
// 15s; without these, four sequential 8s candidate fetches could keep the
// server working long after the user already saw a timeout.
const IMG_FETCH_TIMEOUT = 4500;
const TOTAL_BUDGET_MS = 12_000;

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

// Reject IPs in loopback / private / link-local / metadata ranges, including
// IPv4-mapped IPv6 forms, so a hostname that resolves to an internal address
// cannot slip past the string check above.
function isBlockedIp(ip: string): boolean {
  const h = ip.toLowerCase().trim().replace(/^\[|\]$/g, "");
  const mapped = h.match(/^::ffff:(.+)$/);
  if (mapped) {
    const rest = mapped[1];
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(rest)) return isBlockedIp(rest);
    const hx = rest.match(/^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
    if (hx) {
      const a = parseInt(hx[1], 16);
      const b = parseInt(hx[2], 16);
      return isBlockedIp(
        `${(a >> 8) & 255}.${a & 255}.${(b >> 8) & 255}.${b & 255}`,
      );
    }
  }
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGN shared space (RFC 6598)
    if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking (RFC 2544)
    if (a >= 224) return true; // multicast + reserved
    return false;
  }
  if (h === "::1" || h === "::") return true;
  if (h.startsWith("fc") || h.startsWith("fd")) return true; // unique-local
  if (h.startsWith("fe80")) return true; // link-local
  return false;
}

// Resolve a hostname and confirm EVERY address it maps to is public. This is
// what defeats DNS-rebinding: a public-looking host whose A record points at an
// internal IP is rejected before we ever connect to it.
//
// Known residual risk (accepted): fetch() runs its own DNS resolution after
// this check, so an attacker-controlled DNS server could answer the check with
// a public IP and the connect with a private one (resolve/connect TOCTOU).
// Fully closing it needs a pinned-lookup dispatcher; for a public logo tool
// with no internal services this best-effort guard is the right tradeoff.
async function isPublicHost(hostname: string): Promise<boolean> {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (isBlockedHost(h)) return false;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h) || h.includes(":")) {
    return !isBlockedIp(h);
  }
  try {
    const addrs = await dns.lookup(h, { all: true });
    return addrs.length > 0 && addrs.every((a) => !isBlockedIp(a.address));
  } catch {
    return false;
  }
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

// Fetch with a timeout that follows redirects MANUALLY, re-validating the host
// (via DNS resolution) at every hop, so a redirect cannot bounce us onto an
// internal address. Throws "blocked host" if any hop resolves to a private IP.
async function safeFetch(start: string, ms: number, asText: boolean) {
  let url = start;
  for (let hop = 0; hop < 4; hop++) {
    if (!(await isPublicHost(new URL(url).hostname))) {
      throw new Error("blocked host");
    }
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    let res: Response;
    try {
      res = await fetch(url, {
        signal: ctrl.signal,
        redirect: "manual",
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
    const loc = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && loc) {
      url = new URL(loc, url).href;
      continue;
    }
    return res;
  }
  throw new Error("too many redirects");
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
  const startedAt = Date.now();
  const body = await req.json().catch(() => ({}));
  const parsed = z.object({ url: z.string().max(2048) }).safeParse(body);
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
    res = await safeFetch(url.href, FETCH_TIMEOUT, true);
  } catch (e) {
    if (String((e as Error)?.message).includes("blocked")) {
      return new Response("That URL isn't allowed.", {
        status: 400,
        headers: { "Content-Type": "text/plain" },
      });
    }
    return new Response(
      "Couldn't reach that site. Check the URL and try again.",
      { status: 502, headers: { "Content-Type": "text/plain" } },
    );
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
    // Stay inside the request budget: the client gave up at 15s anyway.
    if (Date.now() - startedAt > TOTAL_BUDGET_MS) break;
    let abs: string;
    try {
      abs = new URL(cand, base).href;
    } catch {
      continue;
    }
    try {
      const u = new URL(abs);
      if (isBlockedHost(u.hostname)) continue;
      const imgRes = await safeFetch(abs, IMG_FETCH_TIMEOUT, false);
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

  // Nothing usable at all (no name, no theme color, no fetchable icon): say so
  // instead of returning a 200 the client renders as a silent no-op "success".
  if (!name && !themeColor && !logoDataUrl) {
    return new Response(
      "Couldn't find brand details on that site. Try uploading your logo instead.",
      { status: 422, headers: { "Content-Type": "text/plain" } },
    );
  }

  return Response.json({
    name: name || null,
    themeColor,
    logoDataUrl,
    sourceUrl: url.hostname.replace(/^www\./, ""),
  });
}
