import { describe, expect, it } from "vitest";
import { validateFile } from "../lib/photo";
import { parseMatches, safeUrl } from "../lib/search";
describe("upload and source security", () => {
  it("rejects executable formats, empty files and oversized files", () => {
    for (const file of [
      { size: 5, type: "image/svg+xml" },
      { size: 0, type: "image/png" },
      { size: 4_000_001, type: "image/jpeg" },
    ])
      expect(() => validateFile(file)).toThrow();
    expect(() => validateFile({ size: 100, type: "image/png" })).not.toThrow();
  });
  it("rejects executable and credential URLs", () => {
    for (const url of [
      "javascript:alert(1)",
      "data:text/html,hello",
      "https://user:password@example.com",
      "file:///etc/passwd",
    ])
      expect(safeUrl(url)).toBeUndefined();
    expect(safeUrl("http://example.com")).toBe("http://example.com/");
    expect(safeUrl("http://example.com", true)).toBeUndefined();
  });
  it("uses only exact image results and deduplicates safe source links", () => {
    const matches = parseMatches({
      search_metadata: { status: "Success" },
      visual_matches: [{ link: "https://wrong.example" }],
      exact_matches: [
        {
          title: "A",
          link: "https://example.com",
          thumbnail: "javascript:alert(1)",
        },
        { link: "https://example.com" },
        { link: "javascript:alert(1)" },
      ],
    });
    expect(matches).toEqual([
      {
        title: "A",
        url: "https://example.com/",
        source: "example.com",
        thumbnail: undefined,
      },
    ]);
  });
  it("never reports failed or malformed responses as successful searches", () => {
    for (const data of [
      null,
      {},
      { error: "quota exceeded" },
      { search_metadata: { status: "Processing" } },
      { search_metadata: { status: "Success" }, exact_matches: {} },
    ])
      expect(() => parseMatches(data)).toThrow();
    expect(parseMatches({ search_metadata: { status: "Success" } })).toEqual(
      [],
    );
  });
});
