import Together from "together-ai";
import { z } from "zod";

/**
 * Image-to-image edit of an existing logo via FLUX.1-kontext, used to produce
 * true brand variants (horizontal lockup, icon-only). Always BYOK — the brand
 * kit requires the user's own Together API key.
 */
export async function POST(req: Request) {
  const json = await req.json();
  const data = z
    .object({
      userAPIKey: z.string().min(1),
      image: z.string(), // data URL or https URL of the base logo
      prompt: z.string(),
      width: z.number().optional(),
      height: z.number().optional(),
    })
    .parse(json);

  const options: ConstructorParameters<typeof Together>[0] = {
    apiKey: data.userAPIKey,
  };
  if (process.env.HELICONE_API_KEY) {
    options.baseURL = "https://together.helicone.ai/v1";
    options.defaultHeaders = {
      "Helicone-Auth": `Bearer ${process.env.HELICONE_API_KEY}`,
    };
  }

  const client = new Together(options);

  try {
    const body = {
      model: "black-forest-labs/FLUX.1-kontext-pro",
      prompt: data.prompt,
      image_url: data.image,
      width: data.width ?? 1024,
      height: data.height ?? 1024,
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
    // Surface a generic failure — the brand kit treats these as skippable.
    return new Response("Could not generate this variant.", {
      status: 500,
      headers: { "Content-Type": "text/plain" },
    });
  }
}

export const runtime = "edge";
