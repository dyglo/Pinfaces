import sharp from "sharp";
import { MAX_BYTES } from "@/lib/photo";
import { parseMatches, SearchProviderError } from "@/lib/search";
export const runtime = "nodejs";
export const maxDuration = 90;
const headers = { "Cache-Control": "no-store" };
const failure = (error: string, status: number) =>
  Response.json({ error }, { status, headers });
export async function POST(request: Request) {
  if (request.headers.get("sec-fetch-site") === "cross-site")
    return failure("Cross-site uploads are not allowed.", 403);
  if (request.headers.get("x-search-consent") !== "1")
    return failure(
      "Confirm permission to send this image to the search provider.",
      403,
    );
  const type = request.headers.get("content-type")?.split(";")[0];
  if (!["image/jpeg", "image/png", "image/webp"].includes(type ?? ""))
    return failure("Use a JPEG, PNG, or WebP image.", 415);
  const reader = request.body?.getReader();
  if (!reader) return failure("The image is empty.", 400);
  let data: Buffer;
  try {
    const chunks: Uint8Array[] = [];
    let length = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > MAX_BYTES) {
        await reader.cancel();
        return failure("Image exceeds the 4 MB limit.", 413);
      }
      chunks.push(value);
    }
    if (!length) return failure("The image is empty.", 400);
    data = Buffer.concat(chunks);
    const image = sharp(data, {
      limitInputPixels: 16_000_000,
      failOn: "warning",
    });
    const meta = await image.metadata();
    if (
      !["jpeg", "png", "webp"].includes(meta.format ?? "") ||
      (meta.pages ?? 1) > 1
    )
      return failure("Use a still JPEG, PNG, or WebP image.", 400);
    data = await image
      .rotate()
      .resize({
        width: 1400,
        height: 1400,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: 80 })
      .toBuffer();
    if (data.length > 500_000)
      data = await sharp(data)
        .resize({ width: 1000, height: 1000, fit: "inside" })
        .jpeg({ quality: 60 })
        .toBuffer();
    if (data.length > 500_000)
      return failure(
        "This image cannot fit the provider upload limit. Choose a smaller image.",
        413,
      );
  } catch {
    return failure("The image is invalid or exceeds 16 megapixels.", 400);
  }
  const key = process.env.SERPAPI_API_KEY;
  if (!key)
    return failure(
      "Web search is not configured. Add SERPAPI_API_KEY to this Vercel environment and redeploy.",
      503,
    );
  let stage = "upload";
  const requestId = crypto.randomUUID();
  function providerFailure(code: string, error: string, status: number) {
    console.warn(
      JSON.stringify({ event: "web_search_failed", requestId, stage, code }),
    );
    return Response.json({ error, code, requestId }, { status, headers });
  }
  try {
    const form = new FormData();
    form.append("api_key", key);
    form.append(
      "image",
      new Blob([new Uint8Array(data)], { type: "image/jpeg" }),
      "search.jpg",
    );
    const upload = await fetch("https://serpapi.com/image", {
      method: "POST",
      body: form,
      cache: "no-store",
      signal: AbortSignal.timeout(20000),
      redirect: "error",
    });
    if (!upload.ok)
      return providerFailure(
        `upload_http_${upload.status}`,
        upload.status === 401
          ? "The search provider rejected the API key."
          : "The search provider could not accept the image. Check your account quota and try again.",
        503,
      );
    const uploaded = await upload.json();
    if (typeof uploaded.image_id !== "string")
      return failure("The provider did not accept the image.", 502);
    stage = "search";
    const query = new URLSearchParams({
      engine: "google_lens",
      type: "exact_matches",
      image_id: uploaded.image_id,
      api_key: key,
    });
    const response = await fetch(`https://serpapi.com/search?${query}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(55000),
      redirect: "error",
    });
    if (!response.ok)
      return providerFailure(
        `search_http_${response.status}`,
        response.status === 429
          ? "The search quota has been reached. Try again later."
          : "The search provider could not complete the search. Check your API key and account quota.",
        response.status === 429 ? 429 : 502,
      );
    const matches = parseMatches(await response.json());
    return Response.json(
      { matches, provider: "Google Lens via SerpApi", mode: "exact_matches" },
      { headers },
    );
  } catch (error) {
    if (error instanceof SearchProviderError) {
      if (error.code === "quota")
        return providerFailure(
          error.code,
          "The search provider quota has been reached. Check your SerpApi account or try again after the quota resets.",
          429,
        );
      if (error.code === "authentication")
        return providerFailure(
          error.code,
          "The search provider rejected the API key. Check the production SerpApi configuration.",
          503,
        );
      return providerFailure(
        error.code,
        "Google Lens could not complete this image search. Try the original image or try again later.",
        502,
      );
    }
    return providerFailure(
      error instanceof Error &&
        ["TimeoutError", "AbortError"].includes(error.name)
        ? "timeout"
        : "service_request",
      "Web search did not complete. Please try again.",
      502,
    );
  }
}
