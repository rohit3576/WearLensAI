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

test("upload both images, receive the stub result, see the before/after slider", async ({
  page,
}) => {
  await page.goto("/");

  await page.setInputFiles(
    'div[aria-label="Your photo dropzone"] input[type="file"]',
    personFile,
  );
  await expect(page.getByText("800x1000", { exact: true })).toBeVisible();

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
