import fs from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Parser from "rss-parser";
import { FRONTIER_DAYS, FRONTIER_TOPICS, selectAIFrontier } from "./ai-frontier-policy.mjs";
import { verifyFrontierResources } from "./ai-frontier-resources.mjs";
import { classifyPaperField, mergePaperRecords, publicationAge } from "./paper-policy.mjs";
import { FIELDS } from "./papers-feeds.mjs";
import { translateRMContent } from "./rm-translations.mjs";

const DATA = fileURLToPath(new URL("../data/", import.meta.url));
const DAY = 86400000;
const ARXIV = "https://export.arxiv.org/api/query";
const dateFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
});
const parser = new Parser({
  customFields: {
    item: [
      ["published", "firstPublished"],
      ["arxiv:comment", "sourceComment"],
      ["arxiv:primary_category", "primaryCategory"],
      ["category", "categories", { keepArray: true }],
      ["author", "authors", { keepArray: true }],
    ],
  },
});

async function readJSON(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    // Invalid persisted data should not be silently overwritten.
    throw error;
  }
}

const clean = value => String(value || "").replace(/\s+/g, " ").trim();
const arxivId = value => String(value || "").match(/^(?:arxiv:)?(\d{4}\.\d{4,5})(?:v\d+)?$/i)?.[1];
const paperKey = paper => arxivId(paper.arxiv_id || paper.id) || paper.id;
const recent = (paper, now) => {
  const age = publicationAge(paper, now);
  return age !== null && age <= FRONTIER_DAYS;
};

function timestamp(value, now) {
  const time = Date.parse(value);
  return Number.isFinite(time) && time <= now ? time : null;
}

const arxivMinute = time => new Date(time).toISOString().slice(0, 16).replace(/\D/g, "");

export function frontierArxivQuery({ cats, queryTerms }, now = Date.now()) {
  const categories = [...new Set(cats)].map(cat => `cat:${cat}`).join(" OR ");
  const terms = [...new Set(queryTerms)].map(term => {
    const phrase = term.replace(/["\\]/g, " ").trim();
    return `ti:"${phrase}" OR abs:"${phrase}"`;
  }).join(" OR ");
  return `(${categories}) AND (${terms}) AND submittedDate:[${arxivMinute(now - FRONTIER_DAYS * DAY)} TO ${arxivMinute(now)}]`;
}

export async function parseFrontierAtom(xml, now = Date.now()) {
  const feed = await parser.parseString(xml);
  return (feed.items || []).flatMap(entry => {
    const id = arxivId(entry.id?.match(/\/abs\/([^/]+)$/)?.[1]);
    // rss-parser uses <updated> when <published> is absent. That would promote edits
    // to old papers as new. Only read the explicit first-publication value.
    const published = timestamp(entry.firstPublished, now);
    const title = clean(entry.title);
    const abstract = clean(entry.summary || entry.content);
    if (!id || published === null || !title || !abstract) return [];
    const cats = [...new Set([
      entry.primaryCategory?.$?.term,
      ...(entry.categories || []).map(category => category?.$?.term),
    ].filter(Boolean))];
    const paper = {
      id: `arxiv:${id}`,
      arxiv_id: id,
      source: "arXiv",
      title_en: title,
      abstract_en: abstract,
      ...(clean(entry.sourceComment) ? { source_comment: clean(entry.sourceComment) } : {}),
      published_at: new Date(published).toISOString(),
      published_precision: "day",
      authors: (entry.authors || []).map(author => clean(author?.name?.[0])).filter(Boolean).slice(0, 10),
      cats,
      url: `https://arxiv.org/abs/${id}`,
      html_url: `https://arxiv.org/abs/${id}`,
      pdf_url: `https://arxiv.org/pdf/${id}`,
    };
    return [{ ...paper, field: classifyPaperField(paper, FIELDS) || "ml" }];
  });
}

function archivalDates(index, now) {
  // A snapshot's date is in Shanghai. Include a small buffer, then apply the
  // precise publication window to each entry.
  const earliest = dateFormat.format(new Date(now - (FRONTIER_DAYS + 2) * DAY));
  const latest = dateFormat.format(new Date(now));
  return [...new Set(index.dates || [])]
    .filter(date => /^\d{4}-\d{2}-\d{2}$/.test(date) && date >= earliest && date <= latest)
    .sort();
}

async function readArchives(dataDir, now) {
  const index = await readJSON(path.join(dataDir, "papers-index.json"), { dates: [] });
  const papers = [];
  let lastSnapshot;
  for (const date of archivalDates(index, now)) {
    const snapshot = await readJSON(path.join(dataDir, "papers", `${date}.json`), null);
    const candidates = (snapshot?.items || []).filter(paper => (arxivId(paper.arxiv_id || paper.id) || paper.reference_review) && recent(paper, now));
    if (!candidates.length) continue;
    papers.push(...candidates);
    const generated = timestamp(snapshot.generatedAt, now);
    if (generated !== null && (!lastSnapshot || generated > Date.parse(lastSnapshot.generatedAt))) {
      lastSnapshot = { date, generatedAt: new Date(generated).toISOString() };
    }
  }
  return { papers, lastSnapshot };
}

function missingReviewIds(reviews, candidates, now) {
  const known = new Set(candidates.map(paperKey));
  const earliestMonth = new Date(now - FRONTIER_DAYS * DAY).toISOString().slice(2, 7).replace("-", "");
  const latestMonth = new Date(now).toISOString().slice(2, 7).replace("-", "");
  return [...reviews.keys()].filter(id => !known.has(id) &&
    id.slice(0, 4) >= earliestMonth && id.slice(0, 4) <= latestMonth).slice(0, 100);
}

async function fetchRecentPapers(reviews, known, now) {
  const items = [];
  let queries = 0;
  let tried = 0;
  let stop = false;
  const request = async params => {
    if (stop) return;
    if (tried) await new Promise(resolve => setTimeout(resolve, 3100));
    tried++;
    const url = `${ARXIV}?${new URLSearchParams(params)}`;
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": "AIResearchTracker/1.0 (github.com/lin-messi/AI-)" },
        signal: AbortSignal.timeout(18000),
      });
      if (!response.ok) {
        stop = response.status === 429 || response.status === 403;
        throw new Error(`HTTP ${response.status}`);
      }
      items.push(...(await parseFrontierAtom(await response.text(), now)).filter(paper => recent(paper, now)));
      queries++;
    } catch (error) {
      console.warn(`AI 前沿 arXiv 查询未完成（${error.message}）`);
    }
  };

  const ids = missingReviewIds(reviews, known, now);
  if (ids.length) await request({ id_list: ids.join(","), max_results: String(ids.length) });
  for (const topic of FRONTIER_TOPICS) {
    await request({
      search_query: frontierArxivQuery(topic, now),
      max_results: "65",
      sortBy: "submittedDate",
      sortOrder: "descending",
    });
  }
  return { items, queries, tried };
}

function attachReviews(candidates, reviews) {
  return candidates.map(paper => {
    const { frontier_review: previousReview, ...metadata } = paper;
    const review = reviews.get(paperKey(paper));
    return review ? { ...metadata, frontier_review: { ...review, id: paperKey(paper) } } : metadata;
  });
}

async function enrichPublicResources(candidates, now) {
  const hasAuthorMention = paper => paper.frontier_review?.resources?.length || paper.frontier_resources?.length ||
    /(?:github\.com\/|huggingface\.co\/)/i.test(`${paper.source_comment || ""} ${paper.abstract_en || ""}`);
  const shortlist = selectAIFrontier(candidates.filter(hasAuthorMention), { now });
  const byId = new Map(candidates.map(paper => [paperKey(paper), paper]));
  await verifyFrontierResources(shortlist.map(paper => byId.get(paperKey(paper))), { limit: 20, now });
}

async function writeSnapshot(file, snapshot) {
  const pending = `${file}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(pending, JSON.stringify(snapshot, null, 2) + "\n", { flag: "wx" });
    await fs.rename(pending, file);
  } finally {
    await fs.rm(pending, { force: true });
  }
}

export async function fetchAIFrontier({ archiveOnly = false, noAI = false, now = Date.now(), dataDir = DATA } = {}) {
  const output = path.join(dataDir, "ai-frontier.json");
  const [previous, catalog, references, archive] = await Promise.all([
    readJSON(output, null),
    readJSON(path.join(dataDir, "ai-frontier-catalog.json"), { papers: [] }),
    readJSON(path.join(dataDir, "research-reference-library.json"), { papers: [] }),
    readArchives(dataDir, now),
  ]);
  const reviews = new Map(catalog.papers.flatMap(review => {
    const id = arxivId(review.id);
    return id ? [[id, review]] : [];
  }));
  const previousItems = previous?.items || [];
  const baseline = mergePaperRecords(previousItems, [...archive.papers, ...references.papers]);
  const live = archiveOnly ? null : await fetchRecentPapers(reviews, baseline, now);
  const candidates = attachReviews(mergePaperRecords(baseline, live?.items || []), reviews);
  if (!archiveOnly) await enrichPublicResources(candidates, now);
  const items = selectAIFrontier(candidates, { now });
  if (!noAI && !archiveOnly) await translateRMContent(items, "paper");

  const sources = { ...previous?.sources };
  if (archive.lastSnapshot && (!sources.archive || Date.parse(archive.lastSnapshot.generatedAt) >= Date.parse(sources.archive.generatedAt))) {
    sources.archive = archive.lastSnapshot;
  }
  if (live?.items.length) {
    sources.arxiv = { checkedAt: new Date(now).toISOString(), queriesSucceeded: live.queries, queriesAttempted: live.tried };
  }
  const collectedTimes = [previous?.generatedAt, sources.archive?.generatedAt, sources.arxiv?.checkedAt]
    .map(value => timestamp(value, now)).filter(time => time !== null);
  const collectionTime = collectedTimes.length ? Math.max(...collectedTimes) : null;
  const snapshot = {
    date: collectionTime === null ? null : dateFormat.format(new Date(collectionTime)),
    generatedAt: collectionTime === null ? null : new Date(collectionTime).toISOString(),
    topics: FRONTIER_TOPICS.map(({ key, label_zh, label_en }) => ({ key, label_zh, label_en })),
    items,
    sources,
  };
  if (JSON.stringify(previous) !== JSON.stringify(snapshot)) await writeSnapshot(output, snapshot);
  console.log(`AI 前沿：${items.length} 篇，${items.filter(item => item.ai_frontier.resources?.length).length} 篇附已核查作者资源。`);
  return snapshot;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  fetchAIFrontier({ archiveOnly: process.argv.includes("--archive-only"), noAI: process.argv.includes("--no-ai") })
    .catch(error => { console.error(error.message); process.exitCode = 1; });
}
