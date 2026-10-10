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
export function parseMatches(body: unknown): WebMatch[] {
  if (!body || typeof body !== "object")
    throw new Error("Invalid search response");
  const data = body as Record<string, unknown>;
  if (data.error) throw new Error("Provider could not complete the search");
  const metadata = data.search_metadata as Record<string, unknown> | undefined;
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
