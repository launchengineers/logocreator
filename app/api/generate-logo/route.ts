import { clerkClient, currentUser } from "@clerk/nextjs/server";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import dedent from "dedent";
import Together from "together-ai";
import { z } from "zod";

let ratelimit: Ratelimit | undefined;

export async function POST(req: Request) {
  const clerkEnabled = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  const user = clerkEnabled ? await currentUser() : null;

  if (clerkEnabled && !user) {
    return new Response("", { status: 404 });
  }

  const json = await req.json();
  const data = z
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
    })
    .parse(json);

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

  const styleLookup: Record<string, string> = {
    Flashy:
      "Flashy, attention grabbing, bold, futuristic and eye-catching, with vibrant neon colors and metallic, glossy accents.",
    Tech: "Minimalist, clean, sleek and modern, with a neutral palette, subtle accents, clean lines and flat shapes.",
    Modern:
      "Modern and forward-thinking, flat design with geometric shapes, clean lines, and strategic negative space.",
    Playful:
      "Playful and lighthearted, with bright bold colors, rounded shapes, and a lively, friendly feel.",
    Abstract:
      "Abstract and artistic, with unique shapes, patterns and creative forms that feel distinctive.",
    Minimal:
      "Minimal, simple and timeless, using negative space, flat design and only the essential details.",
  };

  const logoTypeLookup: Record<string, string> = {
    "icon-name":
      "a combination mark — a distinctive icon paired with the company name in clean, legible typography",
    icon: "an icon-only symbol with no text — a single, standalone mark",
    wordmark:
      "a wordmark — the company name set as distinctive, stylized typography, with no separate icon",
    monogram:
      "a monogram / lettermark built only from the company's initials, arranged into a single geometric mark",
    emblem:
      "an emblem / badge — the company name enclosed within a bordered shape such as a circle, shield or seal",
    abstract:
      "an abstract geometric mark with no text — non-representational, modern and clean",
  };

  const detailLookup: Record<string, string> = {
    Minimal:
      "Keep it minimalist: two or three simple shapes, generous negative space, no fine detail — instantly recognizable even at favicon size.",
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
      ? `Use only the initials of "${data.companyName}", rendered correctly.`
      : `Include the company name "${data.companyName}", spelled correctly and clearly legible.`;

  const colorClause = data.monochrome
    ? `Monochrome: use a single color ${data.primaryColor} for the entire mark, on a solid ${data.backgroundColor} background.`
    : `Primary color ${data.primaryColor}, on a solid ${data.backgroundColor} background.`;

  const prompt = dedent`A single ${logoTypeLookup[logoType] ?? logoTypeLookup["icon-name"]}. A high-quality, award-winning, professional logo in a flat vector style, made for both digital and print. ${styleLookup[data.selectedStyle] ?? ""} ${detailLookup[data.detailLevel ?? "Balanced"] ?? ""}

  ${colorClause} ${textClause} Centered, balanced composition with crisp clean edges and a solid, uncluttered background.${data.additionalInfo ? ` Additional direction: ${data.additionalInfo}.` : ""}`;

  const negativePrompt =
    "photorealistic, photograph, 3d render, mockup, realistic, busy cluttered background, gradient mesh, drop shadow, watermark, signature, deformed text, extra letters, misspelled, blurry, low quality, jpeg artifacts, pixelated";

  try {
    const body = {
      prompt,
      model: "black-forest-labs/FLUX.2-pro",
      width: 1024,
      height: 1024,
      response_format: "base64",
      negative_prompt: negativePrompt,
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

    throw error;
  }
}

export const runtime = "edge";
