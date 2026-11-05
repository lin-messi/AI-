// Repair only the current RM snapshot and general pool; never re-fetch or re-rank content.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fillTranslationGaps, translateRMContent, missingRMTranslation } from "./rm-translations.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const data = path.join(root, "data");
const read = file => JSON.parse(fs.readFileSync(path.join(data, file), "utf8"));
const index = read("robomaster-index.json");
const dayFile = `robomaster/${index.latest}.json`;
const day = read(dayFile);
const general = read("robomaster-general.json");
const paperMap = new Map(day.papers.items.map(p => [p.id, p]));
const repos = [...day.repos.items, ...general.items];
const repoMap = new Map(repos.map(r => [r.id.toLowerCase(), r]));
// Reuse the best archived translations regardless of whether that item made yesterday's top pool.
for (const date of index.dates) {
  const archive = read(`robomaster/${date}.json`);
  for (const paper of archive.papers?.items || []) {
    const target = paperMap.get(paper.id);
    if (target) fillTranslationGaps(target, paper);
  }
  for (const repo of archive.repos?.items || []) {
    const target = repoMap.get(repo.id.toLowerCase());
    if (target) fillTranslationGaps(target, repo, "repo");
  }
}
const save = () => {
  day.generatedAt = new Date().toISOString();
  general.updatedAt = day.generatedAt;
  fs.writeFileSync(path.join(data, dayFile), JSON.stringify(day, null, 2) + "\n");
  fs.writeFileSync(path.join(data, "robomaster-general.json"), JSON.stringify(general, null, 2) + "\n");
};
save();
const options = { checkpoint: save, ...(process.argv.includes("--no-ai") ? { config: { enabled: false } } : {}) };
console.log(`先复用归档译文；论文待翻译 ${day.papers.items.filter(p => missingRMTranslation(p, "paper")).length}，项目待翻译 ${repos.filter(r => missingRMTranslation(r, "repo")).length}`);
const papers = await translateRMContent(day.papers.items, "paper", options);
const libraries = await translateRMContent(repos, "repo", options);
save();
console.log(JSON.stringify({ date: index.latest, papers, libraries }));
if (papers.remaining || libraries.remaining) process.exitCode = 1;
