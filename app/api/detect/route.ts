import { MAX_BYTES } from "@/lib/photo";
export const maxDuration = 30;
const headers = { "Cache-Control": "no-store" };
export async function POST(request: Request) {
  if (request.headers.get("sec-fetch-site") === "cross-site")
    return Response.json(
      { error: "Cross-site uploads are not allowed." },
      { status: 403, headers },
    );
  const type = request.headers.get("content-type")?.split(";")[0] ?? "";
  if (!["image/jpeg", "image/png", "image/webp"].includes(type))
    return Response.json(
      { error: "Use a JPEG, PNG, or WebP image." },
      { status: 415, headers },
    );
  const backend = process.env.DETECTION_API_URL;
  if (!backend)
    return Response.json(
      {
        error:
          "Face detection is not configured yet. No search has been performed.",
      },
      { status: 503, headers },
    );
  try {
    const reader = request.body?.getReader();
    if (!reader)
      return Response.json(
        { error: "The image is empty." },
        { status: 400, headers },
      );
    const chunks: Uint8Array[] = [];
    let length = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_BYTES) {
        await reader.cancel();
        return Response.json(
          { error: "Image exceeds the 4 MB limit." },
          { status: 413, headers },
        );
      }
      chunks.push(value);
    }
    if (!length)
      return Response.json(
        { error: "The image is empty." },
        { status: 400, headers },
      );
    const data = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      data.set(chunk, offset);
      offset += chunk.length;
    }
    const response = await fetch(`${backend.replace(/\/$/, "")}/detect`, {
      method: "POST",
      body: data,
      headers: {
        "Content-Type": type,
        "X-API-Key": process.env.DETECTION_API_KEY ?? "",
      },
      signal: AbortSignal.timeout(25000),
      cache: "no-store",
      redirect: "error",
    });
    const body = await response.json();
    if (!response.ok)
      return Response.json(
        {
          error:
            typeof body.detail === "string"
              ? body.detail
              : "Detection could not complete.",
        },
        { status: response.status, headers },
      );
    return Response.json(body, { headers });
  } catch {
    console.error("Face detection service request failed"); // No upload data or source URLs in logs.
    return Response.json(
      { error: "Face detection is temporarily unavailable. Please try again." },
      { status: 503, headers },
    );
  }
}
