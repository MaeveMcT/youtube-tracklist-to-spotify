import { mkdir, readFile, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";

const manifest = JSON.parse(await readFile("assets/manifest.json", "utf8"));
const output = `web-ext-artifacts/youtube-tracklist-to-spotify-${manifest.version}-source.zip`;
const files = [
  "src",
  "assets",
  "scripts",
  "test",
  ".gitignore",
  "AMO.md",
  "BUILD.md",
  "LICENSE",
  "PRIVACY.md",
  "README.md",
  "package.json",
  "package-lock.json",
  "tsconfig.json",
];

await mkdir("web-ext-artifacts", { recursive: true });
await rm(output, { force: true });
const result = spawnSync("zip", ["-r", output, ...files], { stdio: "inherit" });
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
console.log(`Built AMO source archive: ${output}`);
