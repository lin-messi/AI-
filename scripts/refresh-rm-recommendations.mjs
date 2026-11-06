// Re-rank the latest snapshot from verified archived records; no AI calls, no historical rewrites.
// Optional --repo-metadata <file>: raw GitHub API records fetched during review.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CATEGORIES, CATEGORY_RULES, RM_RULES, AERIAL_PAPERS_MIN, AERIAL_GENERAL_MIN, AERIAL_NATIVE_MIN, PAPERS_CUMULATIVE_MAX, GENERAL_MAX, REPOS_MAX, BACKFILL_DAYS_PAPERS, OPTICAL_PAPERS_MIN, OPTICAL_REPOS_MIN } from "./robomaster-feeds.mjs";
import { isOpticalRelevant } from "./optical-policy.mjs";
import { fillTranslationGaps } from "./rm-translations.mjs";
import { annotateRules, classifyRM, itemText, isAerialRelevant, selectWithTopicCoverage, rulesFingerprint } from "./rm-recommendation-policy.mjs";
import { isRMTopicRelevant } from "./rm-topic-policy.mjs";
import { scorePaperRelevance, scoreRepoRelevance } from "./relevance.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const data = path.join(root, "data");
const read = name => JSON.parse(fs.readFileSync(path.join(data, name), "utf8"));
const idx = read("robomaster-index.json");
const day = read(`robomaster/${idx.latest}.json`);
const now = new Date().toISOString();
const existing = new Map(day.papers.items.map(p => [p.id, p]));
const paperLibraryFlag = process.argv.indexOf("--paper-library");
if (paperLibraryFlag !== -1) {
  const filename = process.argv[paperLibraryFlag + 1];
  if (!filename) throw new Error("--paper-library requires a JSON filename");
  const library = JSON.parse(fs.readFileSync(path.resolve(root, filename), "utf8"));
  const papers = Array.isArray(library) ? library : library.papers || library.items;
  if (!Array.isArray(papers)) throw new Error("Paper library must contain papers/items");
  for (const paper of papers) {
    if (!paper.id || !paper.title_en || !paper.url) throw new Error("Invalid paper library metadata");
    if (!isRMTopicRelevant(paper, "paper")) continue;
    const old = existing.get(paper.id);
    const merged = { ...old, ...paper, first_seen: old?.first_seen || now };
    if (old) fillTranslationGaps(merged, old);
    existing.set(paper.id, merged);
  }
}
let optical = { papers: [], repos: [] };
try { optical = read("rm-optical-library.json"); } catch {}
for (const paper of optical.papers.filter(isOpticalRelevant)) {
  const old = existing.get(paper.id);
  const updated = { ...paper, first_seen: old?.first_seen || now };
  if (old) fillTranslationGaps(updated, old);
  existing.set(paper.id, updated);
}
for (const date of idx.dates) {
  if (Date.now() - Date.parse(date) > BACKFILL_DAYS_PAPERS * 86400000) continue;
  const archive = read(`robomaster/${date}.json`);
  for (const paper of archive.papers?.items || []) {
    const age = Date.now() - Date.parse(paper.published_at);
    if (age >= 0 && age <= BACKFILL_DAYS_PAPERS * 86400000 && isRMTopicRelevant(paper, "paper") && !existing.has(paper.id)) {
      existing.set(paper.id, { ...paper, featured: false, first_seen: now });
    }
  }
}
function update(item, kind) {
  item.categories = classifyRM(item, CATEGORIES, CATEGORY_RULES);
  annotateRules(item, RM_RULES);
  item.relevance = kind === "paper" ? scorePaperRelevance(item) : scoreRepoRelevance(item);
  return item;
}
const rank = (a, b) => b.relevance - a.relevance || (b.heat || b.stars || 0) - (a.heat || a.stars || 0);
const eligible = (item, kind) => isOpticalRelevant(item) || isRMTopicRelevant(item, kind);
day.papers.items = selectWithTopicCoverage([...existing.values()].filter(p => eligible(p, "paper")).map(p => update(p, "paper")).sort(rank), PAPERS_CUMULATIVE_MAX, { aerialMinimum: AERIAL_PAPERS_MIN, opticalMinimum: OPTICAL_PAPERS_MIN });
day.papers.count = day.papers.items.length;
day.repos.items = selectWithTopicCoverage(day.repos.items.filter(r => eligible(r, "repo")).map(r => update(r, "repo")).sort(rank), REPOS_MAX, { aerialMinimum: AERIAL_NATIVE_MIN });
day.repos.count = day.repos.items.length;
day.categories = CATEGORIES;
day.rules_fingerprint = rulesFingerprint(RM_RULES);
day.rules_season = RM_RULES.season;
day.quality_updated_at = now;
const general = read("robomaster-general.json");
const repos = new Map(general.items.map(r => [r.id.toLowerCase(), r]));
for (const repo of optical.repos.filter(isOpticalRelevant)) {
  const old = repos.get(repo.id.toLowerCase());
  const updated = { ...repo, first_seen: old?.first_seen || now };
  if (old) fillTranslationGaps(updated, old, "repo");
  repos.set(repo.id.toLowerCase(), updated);
}
const metadataFlag = process.argv.indexOf("--repo-metadata");
if (metadataFlag !== -1) {
  const metadata = JSON.parse(fs.readFileSync(process.argv[metadataFlag + 1], "utf8"));
  for (const raw of metadata) {
    if (!raw.full_name || !raw.html_url) throw new Error("Invalid GitHub metadata");
    const old = repos.get(raw.full_name.toLowerCase()) || {};
    repos.set(raw.full_name.toLowerCase(), { ...old, id: raw.full_name, full_name: raw.full_name, name: raw.name, owner: raw.owner.login,
      description_en: raw.description || "", description_zh: old.description_zh || "", highlight_zh: old.highlight_zh || "",
      stars: raw.stargazers_count, forks: raw.forks_count, language: raw.language, topics: raw.topics || [], url: raw.html_url,
      homepage: raw.homepage, pushed_at: raw.pushed_at, created_at: raw.created_at, license: raw.license?.spdx_id || null,
      archived: Boolean(raw.archived), metadata_fetched_at: raw.metadata_fetched_at || old.metadata_fetched_at,
      source: "general", first_seen: old.first_seen || now });
  }
}
general.items = selectWithTopicCoverage([...repos.values()].filter(r => eligible(r, "repo")).map(r => update(r, "repo")).sort(rank), GENERAL_MAX, { aerialMinimum: AERIAL_GENERAL_MIN, opticalMinimum: OPTICAL_REPOS_MIN });
general.count = general.items.length;
general.quality_updated_at = now;
general.rules_fingerprint = day.rules_fingerprint;
fs.writeFileSync(path.join(data, `robomaster/${idx.latest}.json`), JSON.stringify(day, null, 2) + "\n");
fs.writeFileSync(path.join(data, "robomaster-general.json"), JSON.stringify(general, null, 2) + "\n");
console.log(JSON.stringify({ date: idx.latest, aerialPapers: day.papers.items.filter(isAerialRelevant).length, aerialGeneral: general.items.filter(isAerialRelevant).length, opticalPapers: day.papers.items.filter(isOpticalRelevant).length, opticalRepos: general.items.filter(isOpticalRelevant).length, rules: RM_RULES.season }));
