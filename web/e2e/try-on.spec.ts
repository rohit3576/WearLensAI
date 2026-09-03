import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";
import sharp from "sharp";

let personFile: string;
let garmentFile: string;

test.beforeAll(async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "e2e-fixtures-"));
  personFile = path.join(dir, "person.png");
  garmentFile = path.join(dir, "garment.png");
  await sharp({
    create: { width: 800, height: 1000, channels: 3 as const, background: "#3a3f4a" },
  })
    .composite([
      {
        input: { create: { width: 160, height: 160, channels: 3 as const, background: "#c88b78" } },
        left: 320,
        top: 80,
      },
      {
        input: { create: { width: 400, height: 350, channels: 3 as const, background: "#565d6b" } },
        left: 200,
        top: 500,
      },
    ])
    .png()
    .toFile(personFile);
  await sharp({
    create: { width: 300, height: 300, channels: 3 as const, background: "#e8e4de" },
  })
    .composite([
      {
        input: { create: { width: 150, height: 180, channels: 3 as const, background: "#2f5d8f" } },
        left: 75,
        top: 60,
      },
    ])
    .png()
    .toFile(garmentFile);
});

test("upload both images, receive the stub result, see the before/after slider", async ({
  page,
}) => {
  await page.goto("/");

  await page.setInputFiles(
    'div[aria-label="Your photo dropzone"] input[type="file"]',
    personFile,
  );
  await expect(page.getByText("Frame your photo")).toBeVisible();
  await page.getByRole("button", { name: "Use photo" }).click();
  await expect(page.getByText("Frame your photo")).toBeHidden();

  await page.setInputFiles(
    'div[aria-label="Garment dropzone"] input[type="file"]',
    garmentFile,
  );
  await expect(page.getByText("300x300", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Try it on" }).click();

  await expect(page).toHaveURL(/\/try-on\/[0-9a-f-]+/);
  await expect(page.getByAltText("After: wearing the garment")).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByAltText("Before: your photo")).toBeVisible();
  await expect(page.getByText("Before", { exact: true })).toBeVisible();
  await expect(page.getByText("After", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Try another look" })).toBeVisible();

  const after = page.getByAltText("After: wearing the garment");
  await expect
    .poll(async () => {
      const handle = await after.elementHandle();
      return handle === null ? "" : handle.getAttribute("src") ?? "";
    })
    .toMatch(/^\/api\/results\//);
});
