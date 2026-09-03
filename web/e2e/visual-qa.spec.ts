import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";
import sharp from "sharp";

const WIDTHS = [375, 768, 1280] as const;

let personFile: string;
let garmentFile: string;

test.beforeAll(async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "qa-fixtures-"));
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

test("visual qa across breakpoints and states", async ({ page }) => {
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await assertNoHorizontalOverflow(page);
    await assertButtonTargetSize(page, "Try it on");
    await page.screenshot({ path: `.data/qa/upload-${width.toString()}.png`, fullPage: true });

    await page.setInputFiles(
      'div[aria-label="Your photo dropzone"] input[type="file"]',
      personFile,
    );
    await expect(page.getByText("Frame your photo")).toBeVisible();
    await assertCropFrameRatio(page);
    await page.screenshot({
      path: `.data/qa/crop-${width.toString()}.png`,
      fullPage: true,
    });
    await page.getByRole("button", { name: "Use photo" }).click();
    await expect(page.getByText("Frame your photo")).toBeHidden();

    await page.setInputFiles(
      'div[aria-label="Garment dropzone"] input[type="file"]',
      garmentFile,
    );
    await expect(page.getByText("300x300", { exact: true })).toBeVisible();
    await assertPreviewSquare(page, "Garment dropzone");
    await page.screenshot({
      path: `.data/qa/upload-filled-${width.toString()}.png`,
      fullPage: true,
    });

    await page.getByRole("button", { name: "Try it on" }).click();
    await expect(page).toHaveURL(/\/try-on\//);
    await expect(page.locator(".animate-pulse")).toBeVisible();
    await assertNoHorizontalOverflow(page);
    await page.screenshot({
      path: `.data/qa/result-processing-${width.toString()}.png`,
      fullPage: true,
    });
    await expect(page.getByAltText("After: wearing the garment")).toBeVisible({
      timeout: 15_000,
    });
    await assertNoHorizontalOverflow(page);
    await page.screenshot({
      path: `.data/qa/result-done-${width.toString()}.png`,
      fullPage: true,
    });
  }
});

/** No horizontal scroll at any breakpoint — layout never overflows the viewport. */
async function assertNoHorizontalOverflow(page: import("@playwright/test").Page): Promise<void> {
  const overflowing = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(overflowing.scrollWidth).toBeLessThanOrEqual(overflowing.clientWidth);
}

/** Touch targets meet the 44px minimum from DESIGN.md. */
async function assertButtonTargetSize(
  page: import("@playwright/test").Page,
  name: string,
): Promise<void> {
  const box = await page.getByRole("button", { name }).boundingBox();
  expect(box).not.toBeNull();
  if (box === null) return;
  expect(box.height).toBeGreaterThanOrEqual(44);
}

/** Preview tiles are square per DESIGN.md. */
async function assertPreviewSquare(
  page: import("@playwright/test").Page,
  label: string,
): Promise<void> {
  const tile = page.locator(`div[aria-label="${label}"] div.aspect-square`);
  await expect(tile).toBeVisible();
  const box = await tile.boundingBox();
  expect(box).not.toBeNull();
  if (box === null) return;
  expect(Math.abs(box.width - box.height)).toBeLessThanOrEqual(2);
}

/** The crop frame renders at the 4:5 output aspect. */
async function assertCropFrameRatio(page: import("@playwright/test").Page): Promise<void> {
  const frame = page
    .getByAltText("Your photo, drag to frame")
    .locator("..");
  const box = await frame.boundingBox();
  expect(box).not.toBeNull();
  if (box === null) return;
  expect(box.width / box.height).toBeGreaterThan(0.75);
  expect(box.width / box.height).toBeLessThan(0.85);
}
