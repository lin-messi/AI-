// Build an isolated static Next.js export, keeping normal Next.js development intact.
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const build = path.join(root, ".cloudflare-build");
// Only this fixed, generated directory may be removed.
if (path.dirname(build) !== root) throw new Error("Unsafe build directory");
await fs.rm(build, { recursive: true, force: true });
await fs.mkdir(build, { recursive: true });
for (const name of ["app", "components", "lib", "data", "jsconfig.json", "package.json"]) {
  await fs.cp(path.join(root, name), path.join(build, name), { recursive: true });
}
try {
  await fs.cp(path.join(root, "public"), path.join(build, "public"), { recursive: true });
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
// API endpoints live in the Worker; no server routes are included in the export.
await fs.rm(path.join(build, "app", "api"), { recursive: true, force: true });
await fs.writeFile(path.join(build, "next.config.mjs"), `export default {
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  experimental: { cpus: 2 },
};\n`);

const archives = {
  "archive": "getAvailableDates",
  "papers": "getPapersDates",
  "github": "getGithubDates",
  "robomaster": "getRoboDates",
};
async function preparePages(dir) {
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const filename = path.join(dir, entry.name);
    if (entry.isDirectory()) await preparePages(filename);
    else if (entry.name === "page.js") {
      let source = await fs.readFile(filename, "utf8");
      source = source.replace(/^export const dynamic = .*;\r?\n/gm, "")
        .replace(/^export const revalidate = .*;\r?\n/gm, "");
      if (path.basename(dir) === "[date]") {
        const getter = archives[path.basename(path.dirname(dir))];
        if (!getter) throw new Error(`Unconfigured dynamic route: ${filename}`);
        source += `\nexport function generateStaticParams() {\n  return ${getter}().map(date => ({ date }));\n}\n`;
      }
      await fs.writeFile(filename, source);
    }
  }
}
await preparePages(path.join(build, "app"));
const result = spawnSync(process.execPath, [path.join(root, "node_modules/next/dist/bin/next"), "build", build], {
  cwd: build,
  stdio: "inherit",
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
});
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status || 1);

const read = async (name, fallback = {}) => {
  try { return JSON.parse(await fs.readFile(path.join(root, "data", name), "utf8")); }
  catch (error) { if (error.code === "ENOENT") return fallback; throw error; }
};
const status = {};
for (const [kind, index, folder] of [
  ["news", "index.json", "archive"],
  ["papers", "papers-index.json", "papers"],
  ["github", "github-index.json", "github"],
  ["robomaster", "robomaster-index.json", "robomaster"],
]) {
  const { latest } = await read(index);
  const day = latest ? await read(`${folder}/${latest}.json`) : {};
  status[kind] = {
    date: day.date || null,
    generatedAt: day.generatedAt || null,
    count: kind === "robomaster"
      ? (day.papers?.items || []).length + (day.repos?.items || []).length + ((await read("robomaster-general.json")).items || []).length
      : (day.items || []).length,
  };
}
const rules = await read("rm-rules.json", null);
status.rules = rules ? { season: rules.season || null, version: rules.version || null, extractedAt: rules.extractedAt || null } : null;
await fs.writeFile(path.join(build, "status.json"), JSON.stringify(status));
await fs.writeFile(path.join(build, "out", "_headers"), `/_next/static/*\n  Cache-Control: public, max-age=31536000, immutable\n`);
console.log("Cloudflare assets and update status are ready.");
