import { randomUUID } from "node:crypto";
export const runtime = "nodejs";
export const maxDuration = 90;
const headers = { "Cache-Control": "no-store" };
const routes =
  /^(health|account|auth\/(register|login|logout)|enrollment(\/refresh)?|domains(\/mine|\/[^/]+(\/verify)?)?|photos(\/[a-f0-9-]+(\/thumbnail)?)?|search|partner\/photos(\/[a-f0-9-]+\/approve)?)$/;
async function proxy(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params;
  const target = path.join("/");
  if (path.some((p) => p === "." || p === "..") || !routes.test(target))
    return Response.json(
      { error: "Unknown enrollment endpoint." },
      { status: 404, headers },
    );
  if (
    request.headers.get("sec-fetch-site") === "cross-site" ||
    (request.headers.get("origin") &&
      request.headers.get("origin") !==
        (process.env.PINFACES_PUBLIC_URL || new URL(request.url).origin))
  )
    return Response.json(
      { error: "Cross-site requests are forbidden." },
      { status: 403, headers },
    );
  const backend = process.env.RECOGNITION_API_URL;
  const key = process.env.RECOGNITION_GATEWAY_KEY;
  if (!backend || !key)
    return Response.json(
      {
        error:
          "Verified recognition is not available yet. The enrollment service requires configuration.",
        code: "NOT_CONFIGURED",
      },
      { status: 503, headers },
    );
  let url: URL;
  try {
    url = new URL(backend);
    if (
      url.username ||
      url.password ||
      (url.protocol !== "https:" &&
        !(
          url.protocol === "http:" &&
          ["127.0.0.1", "localhost"].includes(url.hostname)
        ))
    )
      throw new Error();
  } catch {
    return Response.json(
      { error: "The enrollment service configuration is invalid." },
      { status: 503, headers },
    );
  }
  url.pathname = `${url.pathname.replace(/\/$/, "")}/${target}`;
  url.search = "";
  const outgoing = new Headers({
    "X-Recognition-Gateway": key,
    Origin: process.env.PINFACES_PUBLIC_URL || "https://pinfaces.vercel.app",
    "X-Client-Address":
      request.headers.get("x-vercel-forwarded-for") || "unknown",
  });
  for (const name of [
    "cookie",
    "content-type",
    "x-photo-consent",
    "x-source-url",
    "x-photo-title",
  ]) {
    const value = request.headers.get(name);
    if (value) outgoing.set(name, value);
  }
  try {
    let body: Uint8Array<ArrayBuffer> | undefined;
    if (!["GET", "HEAD"].includes(request.method)) {
      const limit = ["photos", "search"].includes(target) ? 4_000_000 : 32_000;
      const reader = request.body?.getReader();
      const chunks: Uint8Array[] = [];
      let length = 0;
      if (reader)
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          length += value.length;
          if (length > limit) {
            await reader.cancel();
            return Response.json(
              { error: "Request exceeds the supported size." },
              { status: 413, headers },
            );
          }
          chunks.push(value);
        }
      body = new Uint8Array(length);
      let offset = 0;
      for (const chunk of chunks) {
        body.set(chunk, offset);
        offset += chunk.length;
      }
    }
    const response = await fetch(url, {
      method: request.method,
      body,
      headers: outgoing,
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(75000),
    });
    const resultHeaders = new Headers(headers);
    resultHeaders.set(
      "Content-Type",
      response.headers.get("content-type") || "application/json",
    );
    // Keep the library-managed session cookie HttpOnly/Secure and scoped to Pinfaces.
    for (const cookie of response.headers.getSetCookie())
      if (cookie.startsWith("pinfaces_session="))
        resultHeaders.append("Set-Cookie", cookie);
    return new Response(response.status === 204 ? null : response.body, {
      status: response.status,
      headers: resultHeaders,
    });
  } catch {
    const requestId = randomUUID();
    console.warn(
      JSON.stringify({ event: "recognition_service_unreachable", requestId }),
    );
    return Response.json(
      {
        error: "The enrollment service could not be reached. Try again later.",
        requestId,
      },
      { status: 503, headers },
    );
  }
}
export const GET = proxy;
export const POST = proxy;
export const DELETE = proxy;
