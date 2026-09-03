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
    create: { width: 800, height: 1000, channels: 3, background: "#7890a0" },
  })
    .png()
    .toFile(personFile);
  await sharp({
    create: { width: 300, height: 300, channels: 3, background: "#c85050" },
  })
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
    await page.setInputFiles(
      'div[aria-label="Garment dropzone"] input[type="file"]',
      garmentFile,
    );
    await expect(page.getByText("800x1000", { exact: true })).toBeVisible();
    await assertPreviewSquare(page, "Your photo dropzone");
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
