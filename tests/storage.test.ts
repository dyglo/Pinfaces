import "fake-indexeddb/auto";
import { afterEach, expect, it } from "vitest";
import { BrowserCollection } from "../lib/storage";
import type { PhotoRecord } from "../lib/photo";
const storage = new BrowserCollection();
const record = (id: string, expiresAt = Date.now() + 10000): PhotoRecord => ({
  id,
  hash: id,
  title: "Adult photo",
  thumbnail: "data:image/jpeg;base64,x",
  sourceUrl: "https://example.com/original",
  createdAt: Date.now(),
  expiresAt,
  adultConsentAttested: true,
});
afterEach(async () => {
  await storage.clear();
});
it("persists records across storage instances", async () => {
  await storage.add(record("a"));
  expect((await new BrowserCollection().list())[0].sourceUrl).toBe(
    "https://example.com/original",
  );
});
it("deletes the thumbnail and metadata", async () => {
  await storage.add(record("a"));
  await storage.remove("a");
  expect(await storage.list()).toEqual([]);
});
it("clears the entire collection", async () => {
  await storage.add(record("a"));
  await storage.add(record("b"));
  await storage.clear();
  expect(await storage.list()).toEqual([]);
});
it("purges expired records", async () => {
  await storage.add(record("expired", 1));
  await storage.add(record("valid"));
  expect((await storage.list()).map((r) => r.id)).toEqual(["valid"]);
});
it("enforces the 100 photo limit", async () => {
  for (let i = 0; i < 100; i++) await storage.add(record(String(i)));
  await expect(storage.add(record("overflow"))).rejects.toThrow("full");
});
