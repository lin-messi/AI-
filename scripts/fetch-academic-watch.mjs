import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import Parser from "rss-parser";
import { frontierResources } from "./ai-frontier-policy.mjs";
import { verifyFrontierResources } from "./ai-frontier-resources.mjs";

const DATA = fileURLToPath(new URL("../data/", import.meta.url));
const DAY = 86400000;
const RETENTION = 90 * DAY;
const BATCH_SIZE = 36;
export const WATCH_LIMIT = 500;
const ARXIV = /^\d{4}\.\d{4,5}$/;
const DOI = /^10\.\d{4,9}\/[-._;()/:a-z0-9]+$/i;
const TYPES = new Set(["journal-article", "proceedings-article", "book-chapter"]);
const atom = new Parser({
  customFields: { item: [
    ["updated", "revisionDate"], ["arxiv:doi", "authorDoi"],
    ["arxiv:comment", "sourceComment"], ["summary", "sourceAbstract"],
  ] },
});

async function read(file, fallback) {
  try { return JSON.parse(await fs.readFile(file, "utf8")); }
  catch (error) { if (error.code === "ENOENT") return fallback; throw error; }
}
const clean = value => String(value || "").trim().replace(/\s+/g, " ");
const timestamp = (value, now) => {
  const time = Date.parse(value);
  return Number.isFinite(time) && time <= now ? new Date(time).toISOString() : null;
};
const normalizeTitle = value => clean(value).normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

export async function parseWatchAtom(xml, requested, now = Date.now()) {
  const res = await atom.parseString(xml);
  return (res.items || []).flatMap(entry => {
    const match = String(entry.id || "").match(/^https?:\/\/arxiv\.org\/abs\/(\d{4}\.\d{4,5})v([1-9]\d*)\/?$/i);
    if (!match || !requested.has(match[1]) || !Number.isSafeInteger(Number(match[2]))) return [];
    const [id, version] = match.slice(1);
    const revision = timestamp(entry.revisionDate, now);
    if (!revision || !clean(entry.title)) return [];
    return [{
      id: "arxiv:" + id, arxiv_id: id, version: Number(version),
      version_at: revision, title_en: clean(entry.title), abstract_en: clean(entry.sourceAbstract || entry.summary || entry.content),
      source_comment: clean(entry.sourceComment),
      doi: DOI.test(clean(entry.authorDoi)) && !/^10\.48550\//i.test(entry.authorDoi) ? clean(entry.authorDoi).toLowerCase() : null,
    }];
  });
}

export function confirmedPublication(record, work, now = Date.now()) {
  if (!record.doi || !work || String(work.DOI).toLowerCase() !== record.doi.toLowerCase() || !TYPES.has(work.type)) return null;
  if (!normalizeTitle(record.title_en) || normalizeTitle(record.title_en) !== normalizeTitle(work.title?.[0])) return null;
  const parts = (work.published || work["published-online"] || work["published-print"])?.["date-parts"]?.[0];
  if (!Array.isArray(parts) || !parts.length || !parts.every(Number.isInteger)) return null;
  const [year, month, day] = parts;
  const date = [year, ...(month ? [String(month).padStart(2, "0")] : []), ...(day ? [String(day).padStart(2, "0")] : [])].join("-");
  const parsed = Date.parse(date);
  if (!Number.isFinite(parsed) || parsed > now || new Date(parsed).toISOString().slice(0, date.length) !== date) return null;
  return { doi: record.doi, url: "https://doi.org/" + record.doi, venue: clean(work["container-title"]?.[0]), published: date };
}

export function mergeWatchRecord(previous, metadata, timestamp) {
  if (!metadata) return previous;
  if (previous.version && metadata.version < previous.version) return previous;
  const priorResources = Array.isArray(previous.resources) ? previous.resources : [];
  const eventKeys = new Set((previous.events || []).map(event => event.key));
  const events = [...(previous.events || [])];
  const versionUrl = previous.url + "v" + metadata.version;
  const recordEvent = event => {
    if (eventKeys.has(event.key)) return;
    eventKeys.add(event.key);
    events.push({ ...event, observedAt: timestamp });
  };
  if (previous.version && metadata.version > previous.version) recordEvent({
    key: "v" + metadata.version, kind: "version", from: previous.version, to: metadata.version,
    sourceAt: metadata.version_at, url: versionUrl,
  });
  for (const resource of metadata.resources || []) {
    const existed = priorResources.some(old => old.kind === resource.kind && old.url.toLowerCase() === resource.url.toLowerCase());
    if (previous.checkedAt && !existed) recordEvent({
      key: resource.kind + ":" + resource.url.toLowerCase(), kind: resource.kind,
      url: resource.url,
    });
  }
  const publication = metadata.publication || previous.publication || null;
  if (previous.checkedAt && publication && publication.doi !== previous.publication?.doi) recordEvent({
    key: "publication:" + publication.doi, kind: "publication", url: publication.url, sourceAt: publication.published,
  });
  return {
    ...previous, title_en: metadata.title_en || previous.title_en,
    title_zh: metadata.title_en && previous.title_en !== metadata.title_en ? "" : previous.title_zh,
    version: metadata.version, version_at: metadata.version_at, versionUrl, checkedAt: timestamp,
    resources: metadata.resources ?? priorResources, unavailableResources: metadata.frontier_unavailable,
    publication, events: events.slice(-12),
  };
}

function bootstrap(paper, previous, iso) {
  const arxiv = paper.arxiv_id;
  if (!ARXIV.test(arxiv || "")) return null;
  return {
    ...previous,
    id: "arxiv:" + arxiv, arxiv_id: arxiv, url: "https://arxiv.org/abs/" + arxiv,
    title_en: paper.title_en || previous?.title_en || "",
    title_zh: paper.title_zh || previous?.title_zh || "",
    listedAt: iso,
  };
}

export async function refreshAcademicWatch(dataDir = DATA) {
  const target = path.join(dataDir, "academic-watch.json");
  const [previous, frontier, index] = await Promise.all([
    read(target, { updatedAt: null, papers: [] }),
    read(path.join(dataDir, "ai-frontier.json"), { items: [] }),
    read(path.join(dataDir, "papers-index.json"), {}),
  ]);
  const latest = /^\d{4}-\d{2}-\d{2}$/.test(index.latest || "")
    ? await read(path.join(dataDir, "papers", index.latest + ".json"), { items: [] })
    : { items: [] };
  const now = Date.now();
  const iso = new Date(now).toISOString();
  const seeds = new Map();
  for (const paper of [...frontier.items, ...latest.items.filter(paper => paper.featured)]) {
    if (ARXIV.test(paper.arxiv_id || "") && !seeds.has("arxiv:" + paper.arxiv_id)) seeds.set("arxiv:" + paper.arxiv_id, paper);
  }
  const prior = new Map(previous.papers.map(paper => [paper.id, paper]));
  const registry = [...seeds.entries()].map(([id, paper]) => bootstrap(paper, prior.get(id), iso));
  registry.push(...previous.papers.filter(paper => !seeds.has(paper.id) && now - Date.parse(paper.listedAt) <= RETENTION)
    .sort((a, b) => Date.parse(b.listedAt) - Date.parse(a.listedAt)));
  const kept = registry.slice(0, WATCH_LIMIT);
  // Include the newest front page and rotate previously listed entries by oldest check.
  const current = kept.filter(paper => seeds.has(paper.id)).slice(0, BATCH_SIZE);
  const currentIds = new Set(current.map(paper => paper.id));
  const remaining = kept.filter(paper => !currentIds.has(paper.id)).sort((a, b) => (Date.parse(a.checkedAt) || 0) - (Date.parse(b.checkedAt) || 0));
  const poll = [...current, ...remaining].slice(0, BATCH_SIZE * 2);
  const live = new Map();
  for (let start = 0; start < poll.length; start += BATCH_SIZE) {
    if (start) await new Promise(resolve => setTimeout(resolve, 3100));
    const batch = new Set(poll.slice(start, start + BATCH_SIZE).map(paper => paper.arxiv_id));
    const query = new URLSearchParams({ id_list: [...batch].join(","), max_results: String(batch.size) });
    try {
      const res = await fetch("https://export.arxiv.org/api/query?" + query, { signal: AbortSignal.timeout(18000) });
      if (!res.ok) {
        if ([403, 429].includes(res.status)) break;
        continue;
      }
      for (const row of await parseWatchAtom(await res.text(), batch, now)) live.set(row.id, row);
    } catch (error) { console.warn("论文版本核对未完成：", error.message); }
  }

  const enriched = [...live.values()].map(row => {
    const seed = seeds.get(row.id);
    const saved = prior.get(row.id);
    return {
      ...row,
      frontier_resources: [...(saved?.resources || []), ...(seed?.ai_frontier?.resources || [])],
      frontier_unavailable: saved?.unavailableResources,
    };
  });
  await verifyFrontierResources(enriched, { limit: 18, now });
  const publicationTargets = enriched.filter(row => row.doi && prior.get(row.id)?.publication?.doi !== row.doi).slice(0, 8);
  await Promise.all(publicationTargets.map(async row => {
    try {
      const res = await fetch("https://api.crossref.org/works/" + encodeURIComponent(row.doi), { signal: AbortSignal.timeout(6500) });
      if (res.ok) row.publication = confirmedPublication(row, (await res.json()).message, now);
    } catch {}
  }));
  for (const row of enriched) {
    const resources = frontierResources(row, now);
    // Keep the record of an earlier successful check if the source is temporarily unavailable.
    row.resources = resources.length || row.frontier_unavailable?.length ? resources : undefined;
    live.set(row.id, row);
  }
  if (live.size === 0 && previous.papers.length) {
    console.warn("未获取可用 arXiv 记录，保留上一份收藏追踪快照。");
    return previous;
  }
  const output = {
    updatedAt: live.size ? iso : previous.updatedAt,
    papers: kept.map(entry => mergeWatchRecord(entry, live.get(entry.id), iso)),
  };
  const temporary = target + "." + randomUUID() + ".tmp";
  try {
    await fs.writeFile(temporary, JSON.stringify(output, null, 2) + "\n", { flag: "wx" });
    await fs.rename(temporary, target);
  } finally {
    await fs.rm(temporary, { force: true });
  }
  console.log("本轮核对 " + live.size + " 篇 arXiv，追踪池共 " + output.papers.length + " 篇。");
  return output;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  refreshAcademicWatch().catch(error => { console.error(error.message); process.exitCode = 1; });
}
