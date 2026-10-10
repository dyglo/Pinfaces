import { expect, test } from "@playwright/test";
import path from "node:path";
const fixture = (name: string) =>
  path.join(process.cwd(), "tests/fixtures", name);
const source =
  "https://raw.githubusercontent.com/scikit-image/scikit-image/v0.25.2/skimage/data/astronaut.png";
test("real face detection, local exact search, source link, reload and deletion", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Find the photo. Keep your privacy." }),
  ).toBeVisible();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "My collection" })
    .click();
  await page
    .getByLabel("Upload a photograph")
    .setInputFiles(fixture("astronaut.png"));
  await page.getByLabel("Photo title").fill("NASA test photograph");
  await page.getByLabel("Original source URL").fill(source);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Add photograph" }).click();
  await expect(page.getByRole("status")).toContainText("Photo added", {
    timeout: 40000,
  });
  await expect(page.getByLabel("Detected face")).toHaveCount(1);
  await page.getByRole("button", { name: "Photo search" }).click();
  await page.getByRole("button", { name: "Search my collection" }).click();
  await expect(page.getByText("Exact file match", { exact: true })).toBeVisible(
    { timeout: 40000 },
  );
  await expect(page.locator(".result-card a")).toHaveAttribute("href", source);
  await expect(page.locator(".result-card a")).toHaveAttribute(
    "rel",
    "noopener noreferrer",
  );
  await expect(page.locator(".result-card")).toHaveCount(1);
  await page.screenshot({
    path: `test-results/${test.info().project.name}-results.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: "Choose another photo" }).click();
  await page
    .getByLabel("Upload a photograph")
    .setInputFiles(fixture("astronaut-reencoded.jpg"));
  await page.getByRole("button", { name: "Search my collection" }).click();
  await expect(
    page.getByRole("heading", { name: "No exact copies found" }),
  ).toBeVisible({ timeout: 40000 });
  await page.reload();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "My collection" })
    .click();
  await expect(
    page.getByRole("heading", { name: "NASA test photograph" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Delete NASA test photograph", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Your collection starts here" }),
  ).toBeVisible();
  await page.reload();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "My collection" })
    .click();
  await expect(page.locator(".result-card")).toHaveCount(0);
  expect(errors).toEqual([]);
});
test("no-face and multiple-face errors are real", async ({ page }) => {
  await page.goto("/");
  await page
    .getByLabel("Upload a photograph")
    .setInputFiles(fixture("no-face.png"));
  await page.getByRole("button", { name: "Search my collection" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "No face detected",
    { timeout: 40000 },
  );
  await page.getByRole("button", { name: "Choose another photo" }).click();
  await page
    .getByLabel("Upload a photograph")
    .setInputFiles(fixture("multiple-faces.jpg"));
  await page.getByRole("button", { name: "Search my collection" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "Multiple faces detected",
    { timeout: 40000 },
  );
  await expect(page.getByLabel("Detected face")).toHaveCount(2);
  await expect(page.locator(".result-card")).toHaveCount(0);
});
test("safe upload errors, theme and responsive layout", async ({ page }) => {
  await page.goto("/");
  await page.screenshot({
    path: `test-results/${test.info().project.name}-home.png`,
    fullPage: true,
  });
  await page.getByLabel("Upload a photograph").setInputFiles({
    name: "unsafe.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from('<svg onload="alert(1)"/>'),
  });
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "Choose a JPEG",
  );
  await expect(
    page.getByRole("button", { name: "Search my collection" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Switch to dark mode" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.screenshot({
    path: `test-results/${test.info().project.name}-dark.png`,
    fullPage: true,
  });
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("API rejects disguised and unsupported uploads", async ({ request }) => {
  const invalid = await request.post("/api/detect", {
    headers: { "Content-Type": "image/png" },
    data: Buffer.from("<html/>"),
  });
  expect(invalid.status()).toBe(400);
  const unsupported = await request.post("/api/detect", {
    headers: { "Content-Type": "image/svg+xml" },
    data: Buffer.from("<svg/>"),
  });
  expect(unsupported.status()).toBe(415);
  const crossSite = await request.post("/api/detect", {
    headers: { "Content-Type": "image/png", "Sec-Fetch-Site": "cross-site" },
    data: Buffer.from("invalid"),
  });
  expect(crossSite.status()).toBe(403);
});
