import { describe, expect, it } from "vitest";
import {
  exactMatches,
  imageHash,
  MAX_BYTES,
  validateFile,
  validateSource,
  type PhotoRecord,
} from "../lib/photo";
const record: PhotoRecord = {
  id: "one",
  hash: "abc",
  thumbnail: "data:image/jpeg;base64,x",
  sourceUrl: "https://example.com/photo",
  title: "Photo",
  createdAt: 1,
  expiresAt: 1000,
  adultConsentAttested: true,
};
describe("exact-image search", () => {
  it("matches identical bytes and rejects altered bytes", async () => {
    const first = new TextEncoder().encode("original file").buffer;
    const copy = new TextEncoder().encode("original file").buffer;
    const edited = new TextEncoder().encode("original file edit").buffer;
    expect(await imageHash(first)).toBe(await imageHash(copy));
    expect(await imageHash(first)).not.toBe(await imageHash(edited));
  });
  it("returns only exact hashes and unexpired records", () => {
    expect(
      exactMatches(
        "abc",
        [record, { ...record, id: "different", hash: "xyz" }],
        500,
      ),
    ).toEqual([record]);
    expect(exactMatches("abc", [record], 1000)).toEqual([]);
    expect(exactMatches("other", [record], 500)).toEqual([]);
  });
  it("preserves the source URL", () => {
    expect(exactMatches("abc", [record], 500)[0].sourceUrl).toBe(
      "https://example.com/photo",
    );
  });
});
describe("upload and source validation", () => {
  it("accepts supported images", () => {
    expect(() => validateFile({ type: "image/jpeg", size: 50 })).not.toThrow();
  });
  it("rejects SVG, HTML, empty and oversized files", () => {
    for (const file of [
      { type: "image/svg+xml", size: 50 },
      { type: "text/html", size: 50 },
      { type: "image/png", size: 0 },
      { type: "image/png", size: MAX_BYTES + 1 },
    ])
      expect(() => validateFile(file)).toThrow();
  });
  it("rejects executable links, cleartext and credentials", () => {
    for (const link of [
      "javascript:alert(1)",
      "http://example.com",
      "https://user:password@example.com",
      "bad-url",
      "data:text/html,hello",
    ])
      expect(() => validateSource(link)).toThrow();
    expect(validateSource("https://example.com/photo?q=1#original")).toBe(
      "https://example.com/photo?q=1#original",
    );
  });
});
