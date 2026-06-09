import Together from "together-ai";
import { z } from "zod";

/**
 * Image-to-image edit of an existing logo via FLUX.1-kontext. Powers the brand
 * kit's AI variants and the "keep editing" iterate flow. Uses the user's own
 * key when present, else the server key (so free-credit users can edit too).
 */
export async function POST(req: Request) {
  const parsed = z
    .object({
      userAPIKey: z.string().optional(),
      image: z.string(), // data URL or https URL of the base logo
      prompt: z.string(),
      width: z.number().optional(),
      height: z.number().optional(),
    })
    .safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return new Response("Invalid edit request.", {
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

  const options: ConstructorParameters<typeof Together>[0] = { apiKey };
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
    // Generic failure: the brand kit treats these as skippable; the edit flow
    // surfaces the text in a toast.
    return new Response("Couldn't apply that edit. Try again.", {
      status: 500,
      headers: { "Content-Type": "text/plain" },
    });
  }
}

export const runtime = "edge";
