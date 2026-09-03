import { cp, mkdir, rm } from "node:fs/promises";
import { build } from "esbuild";

const outdir = new URL("../dist/", import.meta.url).pathname;

await rm(outdir, { recursive: true, force: true });
await mkdir(outdir, { recursive: true });

await build({
  entryPoints: ["src/background.ts"],
  bundle: true,
  format: "esm",
  outfile: "dist/background.js",
});

await build({
  entryPoints: ["src/detect-in-page.ts"],
  bundle: true,
  format: "iife",
  outfile: "dist/detect-in-page.js",
});

await build({
  entryPoints: ["src/content.ts"],
  bundle: true,
  format: "iife",
  outfile: "dist/content.js",
});

await build({
  entryPoints: ["src/panel/mount.tsx"],
  bundle: true,
  format: "esm",
  jsx: "automatic",
  outfile: "dist/panel.js",
  loader: { ".css": "css" },
});

await cp("public", "dist", { recursive: true });

console.log("extension built to dist/");
