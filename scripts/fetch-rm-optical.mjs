// Verified optical prototypes and paper evidence; the normal collector adds live topical searches.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import Parser from "rss-parser";
import { compactOpticalReadme } from "./optical-policy.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cacheFile = path.join(root, "data/rm-optical-library.json");
const catalogFile = path.join(root, "data/rm-optical-catalog.json");
const parser = new Parser({ timeout: 25000 });
const text = s => String(s || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const ghHeaders = () => ({ Accept: "application/vnd.github+json", "User-Agent": "RMAlgoTracker/1.0", ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}) });
async function json(url, headers = {}) {
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(25000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}
export function validOpticalLibrary(value) {
  return Array.isArray(value?.papers) && Array.isArray(value?.repos)
    && new Set(value.papers.map(p => p.id)).size === value.papers.length
    && value.papers.every(p => p.id && (!p.id.startsWith("doi:") || p.id === `doi:${p.doi}`));
}
export function mergeOpticalArxivMetadata(previous, entry, review) {
  return { ...previous, id: `arxiv:${review.arxiv_id}`, arxiv_id: review.arxiv_id, source: "arXiv",
    title_en: text(entry.title), abstract_en: text(entry.content || entry.summary || entry.description),
    title_zh: previous?.title_zh || "", abstract_zh: previous?.abstract_zh || "", highlight_zh: "", digest_zh: "",
    published_at: new Date(entry.isoDate || entry.pubDate).toISOString(),
    url: `https://arxiv.org/abs/${review.arxiv_id}`, pdf_url: `https://arxiv.org/pdf/${review.arxiv_id}`,
    authors: [], heat: 0, upvotes: 0, featured: false, categories: ["optical"] };
}

export async function fetchOpticalLibrary({ force = false } = {}) {
  const catalog = JSON.parse(fs.readFileSync(catalogFile, "utf8"));
  const catalogHash = createHash("sha256").update(JSON.stringify(catalog)).digest("hex").slice(0, 16);
  let old = { papers: [], repos: [] };
  try { old = JSON.parse(fs.readFileSync(cacheFile, "utf8")); } catch {}
  const freshRecord = record => !force && Date.now() - Date.parse(record.metadata_fetched_at || old.fetchedAt) < 7 * 86400000;
  if (old.catalogHash === catalogHash && validOpticalLibrary(old) && [...old.papers, ...old.repos].every(freshRecord)) return old;
  const now = new Date().toISOString();
  const papers = [], repos = [];
  for (const review of catalog.papers) {
    let paper = old.papers.find(p => (review.arxiv_id && p.arxiv_id === review.arxiv_id) || (review.doi && p.doi === review.doi && p.id === `doi:${review.doi}`));
    let updated = false;
    if (paper && freshRecord(paper)) { paper.metadata_fetched_at ||= old.fetchedAt; paper.optical_review = { ...review, verified: true, checked_at: now }; papers.push(paper); continue; }
    try {
      if (review.arxiv_id) {
        const feed = await parser.parseURL(`https://export.arxiv.org/api/query?id_list=${encodeURIComponent(review.arxiv_id)}`);
        const entry = feed.items?.[0];
        if (!entry?.title) throw new Error("Missing arXiv entry");
        paper = mergeOpticalArxivMetadata(paper, entry, review);
        updated = true;
        await sleep(3100);
      }
      if (review.doi && !review.doi.toLowerCase().startsWith("10.48550/")) {
        const work = (await json(`https://api.crossref.org/works/${encodeURIComponent(review.doi)}`)).message;
        updated = true;
        if (!paper) {
          const date = (work.published || work.issued)?.["date-parts"]?.[0];
          paper = { id: `doi:${review.doi}`, source: "Crossref", title_en: work.title?.[0] || "", title_zh: "",
            abstract_en: text(work.abstract), abstract_zh: "", highlight_zh: "", digest_zh: "", authors: [],
            published_at: date ? `${date[0]}-${String(date[1] || 1).padStart(2, "0")}-${String(date[2] || 1).padStart(2, "0")}T00:00:00.000Z` : null,
            published_precision: date?.length === 3 ? "day" : date?.length === 2 ? "month" : "year",
            url: `https://doi.org/${review.doi}`, heat: 0, upvotes: 0, featured: false, categories: ["optical"] };
        }
        paper.doi = review.doi;
        if (Number.isInteger(work["is-referenced-by-count"])) paper.impact = { citations: work["is-referenced-by-count"], source: "Crossref", source_url: `https://api.crossref.org/works/${encodeURIComponent(review.doi)}`, checked_at: now };
      }
    } catch (error) { console.warn(`光通信论文 ${review.arxiv_id || review.doi} 更新失败（${error.message}），保留已有元数据`); }
    if (paper) { paper.metadata_fetched_at = updated ? now : paper.metadata_fetched_at || old.fetchedAt; paper.optical_review = { ...review, verified: true, checked_at: now }; papers.push(paper); }
  }
  for (const review of catalog.repos) {
    let repo = old.repos.find(r => r.full_name?.toLowerCase() === review.full_name.toLowerCase());
    let updated = false;
    if (repo && freshRecord(repo)) { repo.metadata_fetched_at ||= old.fetchedAt; repo.optical_review = { ...review, verified: true, checked_at: now }; repos.push(repo); continue; }
    try {
      const raw = await json(`https://api.github.com/repos/${review.full_name}`, ghHeaders());
      updated = true;
      let readme = "";
      try {
        const file = await json(`https://api.github.com/repos/${review.full_name}/readme`, ghHeaders());
        readme = Buffer.from(file.content || "", "base64").toString("utf8").slice(0, 16000);
      } catch {}
      repo = { id: raw.full_name, full_name: raw.full_name, name: raw.name, owner: raw.owner.login,
        description_en: raw.description || "", description_zh: repo?.description_zh || "", highlight_zh: repo?.highlight_zh || "",
        stars: raw.stargazers_count, forks: raw.forks_count, language: raw.language, topics: raw.topics || [],
        created_at: raw.created_at, pushed_at: raw.pushed_at, url: raw.html_url, homepage: raw.homepage,
        license: raw.license?.spdx_id || null, archived: raw.archived, source: "general", categories: ["optical"],
        readme_excerpt: compactOpticalReadme(readme || repo?.readme_excerpt || "") };
    } catch (error) { console.warn(`光通信仓库 ${review.full_name} 更新失败（${error.message}），保留已有元数据`); }
    if (repo) { repo.metadata_fetched_at = updated ? now : repo.metadata_fetched_at || old.fetchedAt; repo.optical_review = { ...review, verified: true, checked_at: now }; repos.push(repo); }
    await sleep(350);
  }
  if (!papers.length || !repos.length) {
    if (old.papers.length && old.repos.length) return old;
    throw new Error("No verified optical library available");
  }
  if (new Set(papers.map(p => p.id)).size !== papers.length) throw new Error("Duplicate optical paper identifiers; keep previous library");
  for (const p of papers) if (p.id.startsWith("doi:") && p.id !== `doi:${p.doi}`) throw new Error("Optical DOI/title cache mismatch");
  const result = { fetchedAt: now, catalogHash, papers, repos };
  fs.writeFileSync(cacheFile, JSON.stringify(result, null, 2) + "\n");
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  fetchOpticalLibrary({ force: true }).then(result => console.log(`核验光通信库：论文 ${result.papers.length}，仓库 ${result.repos.length}`))
    .catch(error => { console.error(error.message); process.exitCode = 1; });
}
