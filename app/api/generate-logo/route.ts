import { clerkClient, currentUser } from "@clerk/nextjs/server";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import dedent from "dedent";
import Together from "together-ai";
import { z } from "zod";

// Nearest human color name for a hex: the model honors "blue (#2F6FF5)" far
// more reliably than a bare hex, and this also covers custom-picked colors.
const NAMED_COLORS: [string, [number, number, number]][] = [
  ["white", [255, 255, 255]],
  ["black", [18, 18, 17]],
  ["gray", [128, 128, 128]],
  ["light gray", [201, 200, 194]],
  ["dark gray", [60, 60, 58]],
  ["red", [229, 72, 77]],
  ["crimson", [160, 24, 44]],
  ["orange", [240, 140, 30]],
  ["amber", [242, 180, 20]],
  ["yellow", [242, 196, 15]],
  ["lime", [140, 200, 40]],
  ["green", [48, 164, 108]],
  ["emerald", [10, 130, 90]],
  ["teal", [20, 160, 160]],
  ["cyan", [40, 200, 220]],
  ["sky blue", [90, 170, 240]],
  ["blue", [47, 111, 245]],
  ["navy", [25, 45, 120]],
  ["indigo", [79, 70, 200]],
  ["purple", [150, 70, 210]],
  ["violet", [180, 100, 230]],
  ["magenta", [210, 60, 180]],
  ["pink", [240, 130, 180]],
  ["brown", [140, 90, 50]],
];

function colorName(hex: string): string {
  const h = hex.replace("#", "");
  if (h.length < 6) return hex;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  let best = NAMED_COLORS[0][0];
  let bestD = Infinity;
  for (const [name, [nr, ng, nb]] of NAMED_COLORS) {
    const d = (r - nr) ** 2 + (g - ng) ** 2 + (b - nb) ** 2;
    if (d < bestD) {
      bestD = d;
      best = name;
    }
  }
  return best;
}

let ratelimit: Ratelimit | undefined;

export async function POST(req: Request) {
  const clerkEnabled = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  const user = clerkEnabled ? await currentUser() : null;

  if (clerkEnabled && !user) {
    return new Response("", { status: 404 });
  }

  const parsed = z
    .object({
      userAPIKey: z.string().optional(),
      companyName: z.string(),
      selectedStyle: z.string(),
      logoType: z.string().optional(),
      primaryColor: z.string(),
      backgroundColor: z.string(),
      detailLevel: z.string().optional(),
      monochrome: z.boolean().optional(),
      additionalInfo: z.string().optional(),
      referenceDescription: z.string().optional(),
    })
    .safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return new Response("Invalid request. Please refresh and try again.", {
      status: 400,
      headers: { "Content-Type": "text/plain" },
    });
  }
  const data = parsed.data;

  // Add observability if a Helicone key is specified, otherwise skip
  const options: ConstructorParameters<typeof Together>[0] = {};
  if (process.env.HELICONE_API_KEY) {
    options.baseURL = "https://together.helicone.ai/v1";
    options.defaultHeaders = {
      "Helicone-Auth": `Bearer ${process.env.HELICONE_API_KEY}`,
      "Helicone-Property-LOGOBYOK": data.userAPIKey ? "true" : "false",
    };
  }

  // Add rate limiting if Upstash API keys are set & no BYOK, otherwise skip
  if (process.env.UPSTASH_REDIS_REST_URL && !data.userAPIKey) {
    ratelimit = new Ratelimit({
      redis: Redis.fromEnv(),
      // Allow 3 requests per 2 months on prod
      limiter: Ratelimit.fixedWindow(3, "60 d"),
      analytics: true,
      prefix: "logocreator",
    });
  }

  const client = new Together(options);

  if (data.userAPIKey) {
    client.apiKey = data.userAPIKey;
    if (clerkEnabled && user) {
      (await clerkClient()).users.updateUserMetadata(user.id, {
        unsafeMetadata: {
          remaining: "BYOK",
        },
      });
    }
  }

  if (ratelimit) {
    const identifier = user?.id ?? "anonymous";
    const { success, remaining } = await ratelimit.limit(identifier);
    if (clerkEnabled && user) {
      (await clerkClient()).users.updateUserMetadata(user.id, {
        unsafeMetadata: {
          remaining,
        },
      });
    }

    if (!success) {
      return new Response(
        "You've used up all your credits. Enter your own Together API Key to generate more logos.",
        {
          status: 429,
          headers: { "Content-Type": "text/plain" },
        },
      );
    }
  }

  // Styles describe FORM / technique only: the color comes from the user's
  // brand color below, so a "hand-drawn blue" logo stays blue, not sepia.
  const styleLookup: Record<string, string> = {
    Minimal:
      "Minimal and timeless: two or three simple geometric shapes with generous negative space, clean and flat.",
    Geometric:
      "Geometric and precise: built from angular polygonal shapes, grid-aligned with sharp, clean edges; modern and structured.",
    Gradient:
      "Sleek and contemporary: smooth gradient shading that flows across soft, fluid shapes for a dynamic, modern feel.",
    Mascot:
      "A friendly mascot character: rounded, expressive and approachable, built from bold, confident shapes.",
    "Hand-drawn":
      "Hand-drawn and organic: sketchy, natural linework with imperfect strokes and a human, crafted feel.",
    Luxury:
      "Elegant and luxurious: fine, thin monoline work, refined, minimal and premium.",
    Retro:
      "Retro and vintage: a classic heritage badge feel with nostalgic, time-worn detailing.",
    "3D": "Modern and dimensional: soft three-dimensional depth with gentle lighting and subtle shadows, smooth and polished.",
  };

  const logoTypeLookup: Record<string, string> = {
    "icon-name":
      "a combination mark: a distinctive icon paired with the company name in clean, legible typography",
    icon: "an icon-only symbol with no text, a single, standalone mark",
    wordmark:
      "a wordmark: the company name set as distinctive, stylized typography, with no separate icon",
    monogram:
      "a monogram / lettermark built only from the company's initials, arranged into a single geometric mark",
    emblem:
      "an emblem / badge: the company name enclosed within a bordered shape such as a circle, shield or seal",
    abstract:
      "an abstract geometric mark with no text, non-representational, modern and clean",
  };

  const detailLookup: Record<string, string> = {
    Minimal:
      "Keep it minimalist: two or three simple shapes, generous negative space, no fine detail, instantly recognizable even at favicon size.",
    Balanced:
      "Use a clean, balanced level of detail: simple enough to scale anywhere, with enough character to be memorable.",
    Detailed:
      "Allow refined, considered detail and craftsmanship, while keeping it a clean, scalable logo.",
  };

  const logoType = data.logoType ?? "icon-name";
  const hasText = ["icon-name", "wordmark", "monogram", "emblem"].includes(
    logoType,
  );

  const textClause = !hasText
    ? "Do not include any text, letters or words."
    : logoType === "monogram"
      ? `Use only the initials of "${data.companyName}", rendered correctly and legibly.`
      : `Include the company name "${data.companyName}" spelled EXACTLY and correctly, letter for letter, clearly legible, with no missing, extra, duplicated or misspelled letters.`;

  // Which parts of the logo the brand color must paint (so it's never just the
  // text, or just the icon: the whole logo reads as one brand color).
  const colorTargets: Record<string, string> = {
    "icon-name": "both the icon and the company-name text",
    icon: "the symbol",
    wordmark: "the lettering",
    monogram: "the monogram lettering",
    emblem: "the symbol, the lettering and the border",
    abstract: "the mark",
  };
  const targets = colorTargets[logoType] ?? "the entire logo";

  // "auto" → let the model pick a fitting color instead of forcing one. Works
  // for either the brand color, the background, or both.
  const primaryAuto = data.primaryColor === "auto";
  const bgAuto = data.backgroundColor === "auto";

  const brandColorPhrase = primaryAuto
    ? `a single cohesive brand color of your choice that best suits ${data.companyName || "the brand"} and this style`
    : `${colorName(data.primaryColor)} (exact hex ${data.primaryColor})`;
  const bgPhrase = bgAuto
    ? `a clean, complementary solid background of your choice (a white or soft neutral usually works best)`
    : `a solid ${colorName(data.backgroundColor)} (${data.backgroundColor}) background`;

  const colorClause = data.monochrome
    ? `Color: render ${targets} in a single flat shade of ${brandColorPhrase}, strictly one color, with no other hues, gradients or shading. Place it on ${bgPhrase}, and make sure every part stays clearly legible against that background.`
    : `Color: use ${brandColorPhrase} as the single dominant brand color for ${targets}${primaryAuto ? "" : " (even if this style is conventionally drawn in other colors)"}. Lighter and darker shades or a gradient of the brand color are allowed for depth, but introduce no unrelated colors. Place it on ${bgPhrase}, and make sure every part stays clearly legible against that background.`;

  const prompt = dedent`A single ${logoTypeLookup[logoType] ?? logoTypeLookup["icon-name"]}, designed as a high-quality, award-winning, professional logo with clean, scalable artwork for both digital and print. ${styleLookup[data.selectedStyle] ?? ""} ${detailLookup[data.detailLevel ?? "Balanced"] ?? ""}

  ${colorClause} ${textClause} Centered, balanced composition with crisp, clean edges on a solid, uncluttered background.${data.referenceDescription ? ` Take strong visual inspiration from this reference the user uploaded: ${data.referenceDescription}. Echo its overall composition, shapes and feel, but create an original mark. Do not copy it exactly, and do not reproduce any wordmark, logotype or brand name from it.` : ""}${data.additionalInfo ? ` Additional direction: ${data.additionalInfo}.` : ""}`;

  try {
    const body = {
      prompt,
      model: "black-forest-labs/FLUX.2-pro",
      width: 1024,
      height: 1024,
      response_format: "base64",
    };
    const response = await client.images.create(body);
    return Response.json(response.data[0], { status: 200 });
  } catch (error) {
    const invalidApiKey = z
      .object({
        error: z.object({
          error: z.object({ code: z.literal("invalid_api_key") }),
        }),
      })
      .safeParse(error);

    if (invalidApiKey.success) {
      return new Response("Your API key is invalid.", {
        status: 401,
        headers: { "Content-Type": "text/plain" },
      });
    }

    const modelBlocked = z
      .object({
        error: z.object({
          error: z.object({ type: z.literal("request_blocked") }),
        }),
      })
      .safeParse(error);

    if (modelBlocked.success) {
      return new Response(
        "Your Together AI account needs to be in Build Tier 2 ($50 credit pack purchase required) to use this model. Please make a purchase at: https://api.together.xyz/settings/billing",
        {
          status: 403,
          headers: { "Content-Type": "text/plain" },
        },
      );
    }

    // Anything else (upstream 5xx, timeout, rate limit): return an actionable
    // text/plain message so the client surfaces it instead of a bare 500.
    return new Response(
      "The image service had a problem generating your logo. Please try again in a moment.",
      { status: 502, headers: { "Content-Type": "text/plain" } },
    );
  }
}

export const runtime = "edge";
