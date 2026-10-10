export type WebMatch = {
  title: string;
  source: string;
  url: string;
  thumbnail?: string;
};
export function safeUrl(value: unknown, image = false): string | undefined {
  if (typeof value !== "string" || value.length > 4096) return;
  try {
    const url = new URL(value);
    if (
      url.username ||
      url.password ||
      !(image ? ["https:"] : ["http:", "https:"]).includes(url.protocol)
    )
      return;
    return url.href;
  } catch {
    return;
  }
}
export class SearchProviderError extends Error {
  constructor(
    public readonly code: "quota" | "authentication" | "provider_response",
  ) {
    super(code);
  }
}
export function parseMatches(body: unknown): WebMatch[] {
  if (!body || typeof body !== "object")
    throw new Error("Invalid search response");
  const data = body as Record<string, unknown>;
  const metadata = data.search_metadata as Record<string, unknown> | undefined;
  if (typeof data.error === "string") {
    // Google's explicit no-results response is an empty search, not an outage.
    if (
      metadata?.status === "Success" &&
      /^Google(?: Lens)? hasn't returned any results for this query\.?$/.test(
        data.error,
      )
    )
      return [];
    if (/run out of searches|quota|search limit/i.test(data.error))
      throw new SearchProviderError("quota");
    if (/invalid api key|api key.*invalid|unauthorized/i.test(data.error))
      throw new SearchProviderError("authentication");
    throw new SearchProviderError("provider_response");
  }
  if (metadata?.status !== "Success")
    throw new Error("Search did not complete");
  if (data.exact_matches === undefined) return [];
  if (!Array.isArray(data.exact_matches)) throw new Error("Invalid match list");
  const seen = new Set<string>();
  return data.exact_matches
    .flatMap((item): WebMatch[] => {
      if (!item || typeof item !== "object") return [];
      const url = safeUrl(item.link);
      if (!url || seen.has(url)) return [];
      seen.add(url);
      return [
        {
          url,
          title:
            typeof item.title === "string"
              ? item.title.slice(0, 300)
              : "Image source",
          source: new URL(url).hostname,
          thumbnail: safeUrl(item.thumbnail, true),
        },
      ];
    })
    .slice(0, 60);
}
