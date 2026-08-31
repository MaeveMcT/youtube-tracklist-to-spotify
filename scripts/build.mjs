import { context } from "esbuild";
import { cp, mkdir, rm } from "node:fs/promises";

const watch = process.argv.includes("--watch");
const staticFiles = [
  "manifest.json",
  "popup.html",
  "popup.css",
  "content.css",
  "icon.svg",
];

await rm("dist", { recursive: true, force: true });
await mkdir("dist", { recursive: true });
await Promise.all(
  staticFiles.map((file) => cp(`assets/${file}`, `dist/${file}`)),
);

const build = await context({
  entryPoints: {
    background: "src/background.ts",
    content: "src/content.ts",
    popup: "src/popup.ts",
  },
  outdir: "dist",
  bundle: true,
  format: "iife",
  target: "firefox121",
  legalComments: "none",
  sourcemap: false,
});

if (watch) {
  await build.watch();
  console.log("Watching TypeScript sources; reload the extension after changes.");
} else {
  await build.rebuild();
  await build.dispose();
  console.log("Built temporary add-on in dist/ (select dist/manifest.json in Firefox).");
}
