// Small, auditable reference library. Never infer impact from age or venue alone.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import Parser from "rss-parser";
import { mergePaperRecords } from "./paper-policy.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const catalogFile = path.join(root, "data/research-reference-catalog.json");
const cacheFile = path.join(root, "data/research-reference-library.json");
const clean = text => String(text || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
const parser = new Parser({ timeout: 25000, customFields: { item: [["category", "catList", { keepArray: true }]] } });
const read = (file, fallback) => { try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return fallback; } };
export function crossrefMatches(work, review) {
  const normalize = text => clean(text).toLowerCase().replace(/[^a-z0-9]+/g, "");
  return normalize(work.DOI) === normalize(review.doi) && normalize(work.title?.[0]).includes(normalize(review.title_match));
}
export async function fetchResearchReferences({ force = false } = {}) {
  const catalog = read(catalogFile, { papers: [] });
  const catalogHash = createHash("sha256").update(JSON.stringify(catalog)).digest("hex").slice(0, 16);
  const old = read(cacheFile, { papers: [] });
  const now = new Date().toISOString();
  const fresh = paper => !force && Date.now() - Date.parse(paper.metadata_fetched_at) < 7 * 86400000;
  if (old.catalogHash === catalogHash && old.papers.length === catalog.papers.length && old.papers.every(fresh)) return old;
  const todo = catalog.papers.filter(review => !fresh(old.papers.find(p => p.doi === review.doi) || {}));
  let arxivEntries = [];
  const ids = todo.map(p => p.arxiv_id).filter(Boolean);
  if (ids.length) {
    try {
      const result = await parser.parseURL(`https://export.arxiv.org/api/query?id_list=${encodeURIComponent(ids.join(","))}`);
      arxivEntries = result.items || [];
    } catch (error) { console.warn(`参考文献 arXiv 更新失败（${error.message}），保留缓存`); }
  }
  const papers = [];
  for (const review of catalog.papers) {
    const previous = old.papers.find(p => p.doi === review.doi);
    let paper = previous ? { ...previous, reference_review: review } : null;
    if (previous && fresh(previous)) { papers.push(paper); continue; }
    try {
      const response = await fetch(`https://api.crossref.org/works/${encodeURIComponent(review.doi)}`, {
        headers: { "User-Agent": "AIResearchTracker/1.0" }, signal: AbortSignal.timeout(25000),
      });
      if (!response.ok) throw new Error(`Crossref HTTP ${response.status}`);
      const work = (await response.json()).message;
      if (!crossrefMatches(work, review)) throw new Error("DOI/title identity mismatch");
      const entry = arxivEntries.find(e => [e.id, e.link, e.guid].some(value => String(value || "").includes(`/abs/${review.arxiv_id}`))) || null;
      const date = (work.published || work.issued)?.["date-parts"]?.[0];
      const published = entry?.isoDate || entry?.pubDate;
      const publishedAt = published ? new Date(published).toISOString() : date ? `${date[0]}-${String(date[1] || 1).padStart(2, "0")}-${String(date[2] || 1).padStart(2, "0")}T00:00:00.000Z` : null;
      const cats = (entry?.catList || []).map(c => typeof c === "string" ? c : c.$?.term || c.term || "").filter(Boolean);
      const update = { id: review.arxiv_id ? `arxiv:${review.arxiv_id}` : `doi:${review.doi}`, arxiv_id: review.arxiv_id || "", doi: review.doi,
        title_en: clean(entry?.title || work.title?.[0]), abstract_en: clean(entry?.content || entry?.summary || entry?.description || work.abstract || previous?.abstract_en),
        source: entry ? "arXiv" : "Crossref", field: review.field, cats,
        url: review.arxiv_id ? `https://arxiv.org/abs/${review.arxiv_id}` : `https://doi.org/${review.doi}`,
        pdf_url: review.arxiv_id ? `https://arxiv.org/pdf/${review.arxiv_id}` : "", published_at: publishedAt,
        published_precision: entry || date?.length === 3 ? "day" : date?.length === 2 ? "month" : "year",
        authors: (work.author || []).slice(0, 8).map(a => [a.given, a.family].filter(Boolean).join(" ")),
        heat: 0, upvotes: 0, featured: false, metadata_fetched_at: now, reference_review: review };
      if (Number.isInteger(work["is-referenced-by-count"])) update.impact = { source: "Crossref", citations: work["is-referenced-by-count"], checked_at: now, source_url: `https://api.crossref.org/works/${encodeURIComponent(review.doi)}` };
      paper = mergePaperRecords(previous ? [previous] : [], [update])[0];
    } catch (error) { console.warn(`参考文献 ${review.doi} 更新失败（${error.message}），保留已有证据与核验日期`); }
    if (paper) papers.push(paper);
  }
  if (!papers.length) throw new Error("没有可核验的参考文献，未覆盖已有缓存");
  const result = { catalogHash, fetchedAt: now, papers };
  fs.writeFileSync(cacheFile, JSON.stringify(result, null, 2) + "\n");
  return result;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  fetchResearchReferences({ force: process.argv.includes("--force") }).then(data => console.log(`参考文献证据：${data.papers.length} 条`)).catch(error => { console.error(error.message); process.exitCode = 1; });
}
