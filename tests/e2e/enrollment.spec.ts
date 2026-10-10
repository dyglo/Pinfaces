import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
test("recognition homepage is honest, responsive and supports dark mode", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", {
      name: "Your photographs. Across different moments.",
    }),
  ).toBeVisible();
  await expect(
    page.getByText("This searches your authorized photographs.", {
      exact: false,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Switch to dark mode" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `test-results/${test.info().project.name}-recognition-home.png`,
    fullPage: true,
  });
});
test("real account registration does not bypass adult verification", async ({
  page,
}) => {
  test.skip(
    Boolean(process.env.BASE_URL),
    "Local negative integration: requires configured test backend, never activates identity verification.",
  );
  await page.goto("/enroll");
  await page
    .getByRole("button", { name: "New here? Create an account" })
    .click();
  await page
    .getByLabel("Email", { exact: true })
    .fill(`pilot-${randomUUID()}@example.org`);
  await page
    .getByLabel("Password", { exact: true })
    .fill("strong-browser-test-password");
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Verify your adult identity" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Continue to live verification" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Find my photographs" }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Delete account and all data" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Create your account" }),
  ).toBeVisible();
});
test("proxy rejects traversal and cross-site biometric uploads", async ({
  request,
}) => {
  const invalid = await request.post("/api/recognition/not-a-route", {
    data: "unused",
  });
  expect(invalid.status()).toBe(404);
  const cross = await request.post("/api/recognition/search", {
    headers: { "Sec-Fetch-Site": "cross-site", "Content-Type": "image/png" },
    data: "unused",
  });
  expect(cross.status()).toBe(403);
  const unknown = await request.post("/api/recognition/search", {
    headers: { "Content-Type": "image/png" },
    data: "unused",
  });
  expect([401, 503]).toContain(unknown.status());
});
