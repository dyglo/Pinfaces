import { expect, test } from "@playwright/test";
import path from "node:path";
const fixture = (name: string) =>
  path.join(process.cwd(), "tests/fixtures", name);
test("upload preview, consent, clear session and responsive theme", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Find where your photo appears." }),
  ).toBeVisible();
  await expect(page.getByText("My collection", { exact: true })).toHaveCount(0);
  await page
    .getByLabel("Upload a photograph")
    .setInputFiles(fixture("astronaut.png"));
  await expect(page.getByAltText("Uploaded photograph preview")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Search the web", exact: true }),
  ).toBeDisabled();
  await page.getByRole("checkbox").check();
  await expect(
    page.getByRole("button", { name: "Search the web", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Choose another photo" }).click();
  await expect(page.getByAltText("Uploaded photograph preview")).toHaveCount(0);
  await page.getByLabel("Upload a photograph").setInputFiles({
    name: "bad.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from("<svg/>"),
  });
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "Choose a JPEG",
  );
  await page.getByRole("button", { name: "Switch to dark mode" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `test-results/${test.info().project.name}-web-home.png`,
    fullPage: true,
  });
});
test("search rejects unconsented, disguised, unsupported and cross-site uploads", async ({
  request,
}) => {
  const send = (
    headers: Record<string, string>,
    data = Buffer.from("<html/>"),
  ) => request.post("/api/search", { headers, data });
  expect((await send({ "Content-Type": "image/png" })).status()).toBe(403);
  expect(
    (
      await send({ "Content-Type": "image/png", "X-Search-Consent": "1" })
    ).status(),
  ).toBe(400);
  expect(
    (
      await send({ "Content-Type": "image/svg+xml", "X-Search-Consent": "1" })
    ).status(),
  ).toBe(415);
  expect(
    (
      await send({
        "Content-Type": "image/png",
        "X-Search-Consent": "1",
        "Sec-Fetch-Site": "cross-site",
      })
    ).status(),
  ).toBe(403);
});
test("live provider returns real source pages for a public NASA Earth image", async ({
  page,
}) => {
  test.skip(
    process.env.LIVE_SEARCH_TESTS !== "1",
    "Opt-in: uses a real provider search credit",
  );
  test.setTimeout(120000);
  await page.goto("/");
  await page
    .getByLabel("Upload a photograph")
    .setInputFiles(fixture("earth.jpg"));
  await page.getByRole("checkbox").check();
  await page
    .getByRole("button", { name: "Search the web", exact: true })
    .click();
  await expect(page.locator(".result-card").first()).toBeVisible({
    timeout: 90000,
  });
  const links = await page
    .locator(".result-content a")
    .evaluateAll((elements) =>
      elements.map((e) => (e as HTMLAnchorElement).href),
    );
  expect(links.length).toBeGreaterThan(0);
  expect(links.every((link) => /^https?:\/\//.test(link))).toBe(true);
  const sourceResponse = await page.request.get(links[0]);
  expect(sourceResponse.status()).toBeLessThan(400);
  await expect(page.locator(".result-image img").first()).toBeVisible();
  await expect
    .poll(() =>
      page
        .locator(".result-image img")
        .first()
        .evaluate((image) => (image as HTMLImageElement).naturalWidth),
    )
    .toBeGreaterThan(0);
  console.log(
    JSON.stringify({
      sources: links.length,
      domains: links.slice(0, 5).map((link) => new URL(link).hostname),
    }),
  );
  await page.screenshot({
    path: `test-results/${test.info().project.name}-live-results.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: "Clear search" }).click();
  await expect(page.locator(".result-card")).toHaveCount(0);
});
