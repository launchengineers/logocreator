import { z } from "zod";

/**
 * Reads an uploaded reference logo with a Together vision model and returns a
 * compact, structured read the creator can act on (description + a style/color
 * guess that pre-selects the matching controls). The image is forwarded only to
 * Together via this route and never persisted.
 *
 * Model is a single const for easy swapping. Confirmed available on Together:
 * Qwen2.5-VL-72B (primary), or meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP4.
 * Uses a direct fetch to /chat/completions (de-risks the pinned SDK's chat API).
 */
const REFERENCE_MODEL = "meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP4";

const STYLES = [
  "Minimal",
  "Geometric",
  "Gradient",
  "Mascot",
  "Hand-drawn",
  "Luxury",
  "Retro",
  "3D",
] as const;

const PROMPT = `You are a brand-design analyst. Study this reference logo/image and respond with ONLY a compact JSON object (no prose, no markdown fences) with these keys:
- "description": one tight sentence (max 240 chars) describing the mark's composition, shapes, motif and overall feel. Do NOT state the company name or transcribe any text in the logo.
- "styleGuess": exactly one of ${JSON.stringify(STYLES)}, whichever best matches.
- "dominantColor": the single most prominent brand color as a 6-digit hex like "#2F6FF5", or "auto" if it is grayscale or multicolor with no clear dominant.
- "keywords": an array of 3 to 6 short adjectives.
Return only the JSON object.`;

export async function POST(req: Request) {
  const parsed = z
    .object({
      userAPIKey: z.string().optional(),
      image: z.string(), // data URL
    })
    .safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return new Response("Invalid request.", {
      status: 400,
      headers: { "Content-Type": "text/plain" },
    });
  }
  const data = parsed.data;

  const apiKey = data.userAPIKey?.trim() || process.env.TOGETHER_API_KEY;
  if (!apiKey) {
    return new Response("No API key available.", {
      status: 401,
      headers: { "Content-Type": "text/plain" },
    });
  }

  const baseURL = process.env.HELICONE_API_KEY
    ? "https://together.helicone.ai/v1"
    : "https://api.together.xyz/v1";
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  };
  if (process.env.HELICONE_API_KEY) {
    headers["Helicone-Auth"] = `Bearer ${process.env.HELICONE_API_KEY}`;
  }

  try {
    const res = await fetch(`${baseURL}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: REFERENCE_MODEL,
        max_tokens: 320,
        temperature: 0.2,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: PROMPT },
              { type: "image_url", image_url: { url: data.image } },
            ],
          },
        ],
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      if (res.status === 401) {
        return new Response("Your API key is invalid.", {
          status: 401,
          headers: { "Content-Type": "text/plain" },
        });
      }
      if (/non-serverless|model_not_available/i.test(body)) {
        return new Response(
          "Reading references needs serverless chat access on your Together account (image generation still works). Check your plan at api.together.ai.",
          { status: 403, headers: { "Content-Type": "text/plain" } },
        );
      }
      if (/request_blocked|tier|not allowed/i.test(body)) {
        return new Response(
          "Your Together account tier doesn't allow this model yet.",
          { status: 403, headers: { "Content-Type": "text/plain" } },
        );
      }
      return new Response("Couldn't read that image. Try another file.", {
        status: 502,
        headers: { "Content-Type": "text/plain" },
      });
    }

    const out = await res.json();
    const text: string = out?.choices?.[0]?.message?.content ?? "";

    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(text);
    } catch {
      const m = text.match(/\{[\s\S]*\}/);
      if (m) {
        try {
          parsed = JSON.parse(m[0]);
        } catch {
          /* fall through to text-only */
        }
      }
    }

    const styleGuess =
      typeof parsed.styleGuess === "string" &&
      (STYLES as readonly string[]).includes(parsed.styleGuess)
        ? parsed.styleGuess
        : null;
    const dominantColor =
      typeof parsed.dominantColor === "string" &&
      /^#[0-9a-fA-F]{6}$/.test(parsed.dominantColor)
        ? parsed.dominantColor
        : "auto";
    const description =
      typeof parsed.description === "string" && parsed.description.trim()
        ? parsed.description.trim().slice(0, 240)
        : text.replace(/[{}"]/g, " ").trim().slice(0, 240);
    const keywords = Array.isArray(parsed.keywords)
      ? parsed.keywords
          .filter((k): k is string => typeof k === "string")
          .slice(0, 6)
      : [];

    return Response.json(
      { description, styleGuess, dominantColor, keywords },
      { status: 200 },
    );
  } catch {
    return new Response("Couldn't read that image. Try another file.", {
      status: 502,
      headers: { "Content-Type": "text/plain" },
    });
  }
}

export const runtime = "edge";
